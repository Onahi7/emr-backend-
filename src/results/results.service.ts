import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Result, ResultFlagEnum, ResultStatusEnum } from '../database/schemas/result.schema';
import { Order } from '../database/schemas/order.schema';
import { Patient } from '../database/schemas/patient.schema';
import { TestCatalog } from '../database/schemas/test-catalog.schema';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { CreateResultDto } from './dto/create-result.dto';
import { UpdateResultDto } from './dto/update-result.dto';
import { AmendResultDto } from './dto/amend-result.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { resolveReferenceRange } from '../common/utils/reference-range-resolver';

/**
 * Qualitative result values that should be flagged as abnormal (high).
 */
const ABNORMAL_QUALITATIVE_VALUES = new Set([
  // Serology: Reactive means positive
  'Reactive',
  'Weakly Reactive',
  'Reactive (HSV-1)',
  'Reactive (HSV-2)',
  'Reactive (HSV-1 & 2)',
  'Reactive (1:1)',
  'Reactive (1:2)',
  'Reactive (1:4)',
  'Reactive (1:8)',
  'Reactive (1:16)',
  'Reactive (1:32)',
  // STI: Positive means detected
  'Positive',
  'Positive (P. falciparum)',
  'Positive (P. vivax)',
  'Positive (Mixed)',
  // WIDAL: IgM reactive = acute
  'IgM: Reactive      |  IgG: Non-Reactive',
  'IgM: Reactive      |  IgG: Reactive',
]);

@Injectable()
export class ResultsService {
  private static readonly MCHC_TEST_CODE = 'MCHC';

  constructor(
    @InjectModel(Result.name) private resultModel: Model<Result>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(TestCatalog.name) private testCatalogModel: Model<TestCatalog>,
    private realtimeGateway: RealtimeGateway,
  ) {}

  private isMchcTest(testCode?: string): boolean {
    return (testCode || '').trim().toUpperCase() === ResultsService.MCHC_TEST_CODE;
  }

  private formatScaledNumericValue(numericValue: number): string {
    if (!Number.isFinite(numericValue)) {
      return '';
    }

    return parseFloat(numericValue.toFixed(1)).toString();
  }

  private normalizeMchcValue(testCode: string, rawValue?: string): string | undefined {
    if (rawValue === undefined || rawValue === null) {
      return rawValue;
    }

    const value = String(rawValue).trim();
    if (!value || !this.isMchcTest(testCode)) {
      return value;
    }

    const numericValue = parseFloat(value);
    if (Number.isNaN(numericValue)) {
      return value;
    }

    const normalizedValue = numericValue > 100 ? numericValue / 10 : numericValue;
    return this.formatScaledNumericValue(normalizedValue);
  }

  private normalizeMchcRange(testCode: string, rawRange?: string): string | undefined {
    if (rawRange === undefined || rawRange === null) {
      return rawRange;
    }

    const range = String(rawRange).trim();
    if (!range || !this.isMchcTest(testCode)) {
      return range;
    }

    const sanitizedRange = range.replace(/\bg\s*\/\s*(?:d)?l\b/gi, '').trim();

    const rangeMatch = sanitizedRange.match(/^(-?\d*\.?\d+)\s*(?:-|–)\s*(-?\d*\.?\d+)$/);
    if (rangeMatch) {
      const low = parseFloat(rangeMatch[1]);
      const high = parseFloat(rangeMatch[2]);
      const normalizedLow = low > 100 ? low / 10 : low;
      const normalizedHigh = high > 100 ? high / 10 : high;
      return `${this.formatScaledNumericValue(normalizedLow)}-${this.formatScaledNumericValue(normalizedHigh)}`;
    }

    const thresholdMatch = sanitizedRange.match(/^(<=|>=|<|>|≤|≥)\s*(-?\d*\.?\d+)$/);
    if (thresholdMatch) {
      const operator = thresholdMatch[1];
      const threshold = parseFloat(thresholdMatch[2]);
      const normalizedThreshold = threshold > 100 ? threshold / 10 : threshold;
      return `${operator} ${this.formatScaledNumericValue(normalizedThreshold)}`;
    }

    return sanitizedRange.replace(/-?\d*\.?\d+/g, (token) => {
      const numericValue = parseFloat(token);
      if (Number.isNaN(numericValue)) {
        return token;
      }

      const normalizedValue = numericValue > 100 ? numericValue / 10 : numericValue;
      return this.formatScaledNumericValue(normalizedValue);
    });
  }

  private normalizeMchcUnit(testCode: string, rawUnit?: string): string | undefined {
    if (this.isMchcTest(testCode)) {
      return 'g/dL';
    }

    return rawUnit;
  }

  private async resolveReferenceRangeForResult(
    orderId: Types.ObjectId,
    testCode: string,
    explicitReferenceRange?: string,
    menstrualPhase?: string,
  ): Promise<string | undefined> {
    if (explicitReferenceRange) {
      return this.normalizeMchcRange(testCode, explicitReferenceRange);
    }

    const order = await this.orderModel
      .findById(orderId)
      .select('patientId')
      .lean();

    if (!order?.patientId) {
      return undefined;
    }

    const [patient, testCatalog] = await Promise.all([
      this.patientModel.findById(order.patientId).select('age gender').lean(),
      this.testCatalogModel.findOne({ code: testCode }).select('referenceRange referenceRanges').lean(),
    ]);

    if (!patient || !testCatalog) {
      return undefined;
    }

    const isPregnancy = menstrualPhase === 'pregnancy';
    const condition = isPregnancy ? undefined : menstrualPhase;

    const resolvedReferenceRange = resolveReferenceRange({
      age: patient.age,
      gender: patient.gender as any,
      referenceRanges: testCatalog.referenceRanges,
      simpleReferenceRange: testCatalog.referenceRange,
      pregnancy: isPregnancy || undefined,
      condition,
    });

    return this.normalizeMchcRange(testCode, resolvedReferenceRange);
  }

  /**
   * Calculate result flag based on value and reference range.
   * Handles both numeric ranges and qualitative values.
   * @param value - The test result value
   * @param referenceRange - The reference range (e.g., "12-16", "< 5.0", or qualitative)
   * @returns The calculated flag
   */
  calculateFlag(value: string, referenceRange?: string): ResultFlagEnum {
    if (!referenceRange) {
      return ResultFlagEnum.NORMAL;
    }

    const trimmedValue = String(value || '').trim();

    // ── Qualitative flag check (serology / rapid tests) ────────────────
    // If value is non-numeric, check against known abnormal qualitative values
    const numericCheck = parseFloat(trimmedValue);
    if (isNaN(numericCheck)) {
      return this.calculateQualitativeFlag(trimmedValue);
    }

    // ── Numeric flag calculation ───────────────────────────────────────
    const comparisonValueMatch = trimmedValue.match(/^([<>]=?|≤|≥)\s*(-?\d*\.?\d+)$/);
    const numericValue = comparisonValueMatch
      ? parseFloat(comparisonValueMatch[2])
      : parseFloat(trimmedValue);
    const comparisonOperator = comparisonValueMatch ? comparisonValueMatch[1] : null;

    // Parse reference range
    // Formats: "12-16", "< 5.0", "> 100", "12.5 - 16.5"
    const rangeMatch = referenceRange.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
    if (rangeMatch) {
      const low = parseFloat(rangeMatch[1]);
      const high = parseFloat(rangeMatch[2]);
      let effectiveValue = numericValue;

      if (comparisonOperator === '>' || comparisonOperator === '>=' || comparisonOperator === '≥') {
        effectiveValue = numericValue + 0.001;
      } else if (comparisonOperator === '<' || comparisonOperator === '<=' || comparisonOperator === '≤') {
        effectiveValue = numericValue - 0.001;
      }

      // Define critical thresholds (30% beyond normal range)
      const range = high - low;
      const criticalLowThreshold = low - range * 0.3;
      const criticalHighThreshold = high + range * 0.3;

      if (effectiveValue < criticalLowThreshold) {
        return ResultFlagEnum.CRITICAL_LOW;
      } else if (effectiveValue < low) {
        return ResultFlagEnum.LOW;
      } else if (effectiveValue > criticalHighThreshold) {
        return ResultFlagEnum.CRITICAL_HIGH;
      } else if (effectiveValue > high) {
        return ResultFlagEnum.HIGH;
      } else {
        return ResultFlagEnum.NORMAL;
      }
    }

    // Handle threshold formats: "< X", "<= X", "> X", ">= X"
    const thresholdMatch = referenceRange.match(/^\s*(<=|>=|<|>|≤|≥)\s*(\d+\.?\d*)\s*$/);
    if (thresholdMatch) {
      const rangeOperator = thresholdMatch[1];
      const threshold = parseFloat(thresholdMatch[2]);
      const rangeIsUpperBound = rangeOperator === '<' || rangeOperator === '<=' || rangeOperator === '≤';

      if (rangeIsUpperBound) {
        if (comparisonOperator === '>' || comparisonOperator === '>=' || comparisonOperator === '≥') {
          return ResultFlagEnum.HIGH;
        }

        if (comparisonOperator === '<' || comparisonOperator === '<=' || comparisonOperator === '≤') {
          return ResultFlagEnum.NORMAL;
        }

        return numericValue >= threshold ? ResultFlagEnum.HIGH : ResultFlagEnum.NORMAL;
      }

      if (comparisonOperator === '<' || comparisonOperator === '<=' || comparisonOperator === '≤') {
        return ResultFlagEnum.LOW;
      }

      if (comparisonOperator === '>' || comparisonOperator === '>=' || comparisonOperator === '≥') {
        return ResultFlagEnum.NORMAL;
      }

      return numericValue <= threshold ? ResultFlagEnum.LOW : ResultFlagEnum.NORMAL;
    }

    return ResultFlagEnum.NORMAL;
  }

  /**
   * Calculate flag for qualitative (non-numeric) results.
   * Reactive, Positive, Detected → HIGH
   * Non-Reactive, Negative, Not Detected → NORMAL
   */
  private calculateQualitativeFlag(value: string): ResultFlagEnum {
    if (!value) return ResultFlagEnum.NORMAL;

    if (ABNORMAL_QUALITATIVE_VALUES.has(value)) {
      return ResultFlagEnum.HIGH;
    }

    return ResultFlagEnum.NORMAL;
  }

  private isNumericReferenceRange(referenceRange?: string): boolean {
    if (!referenceRange) {
      return false;
    }

    const normalized = referenceRange.trim();
    if (!normalized) {
      return false;
    }

    if (/\d+\.?\d*\s*-\s*\d+\.?\d*/.test(normalized)) {
      return true;
    }

    if (/^(<|>|<=|>=|≤|≥)\s*\d+\.?\d*$/.test(normalized)) {
      return true;
    }

    return false;
  }

  private isNumericValue(value: string): boolean {
    if (value === undefined || value === null) {
      return false;
    }

    const numericPattern = /^-?\d*\.?\d+$/;
    return numericPattern.test(String(value).trim());
  }

  /**
   * Create a new result (manual entry)
   */
  async create(
    createResultDto: CreateResultDto,
    userId?: string,
    userRoles: string[] = [],
  ): Promise<Result> {
    const isReceptionistEntry = userRoles.includes(UserRoleEnum.RECEPTIONIST);
    const orderObjectId = new Types.ObjectId(createResultDto.orderId);
    const resolvedReferenceRange = await this.resolveReferenceRangeForResult(
      orderObjectId,
      createResultDto.testCode,
      isReceptionistEntry ? undefined : createResultDto.referenceRange,
      createResultDto.menstrualPhase,
    );

    // Fetch subcategory from test catalog
    const testCatalog = await this.testCatalogModel
      .findOne({ code: createResultDto.testCode })
      .select('subcategory unit')
      .lean();

    const normalizedValue =
      this.normalizeMchcValue(createResultDto.testCode, createResultDto.value) ||
      createResultDto.value;
    const normalizedReferenceRange = this.normalizeMchcRange(
      createResultDto.testCode,
      resolvedReferenceRange,
    );
    const normalizedUnit = this.normalizeMchcUnit(
      createResultDto.testCode,
      createResultDto.unit || testCatalog?.unit,
    );

    // Calculate flag if not provided
    const flag =
      createResultDto.flag ||
      this.calculateFlag(normalizedValue, normalizedReferenceRange);

    const userObjectId = userId ? new Types.ObjectId(userId) : undefined;

    const result = new this.resultModel({
      ...createResultDto,
      value: normalizedValue,
      unit: normalizedUnit,
      orderId: orderObjectId,
      orderTestId: createResultDto.orderTestId
        ? new Types.ObjectId(createResultDto.orderTestId)
        : undefined,
      referenceRange: normalizedReferenceRange,
      subcategory: testCatalog?.subcategory,
      flag,
      status: ResultStatusEnum.VERIFIED, // Auto-verify all results
      resultedAt: new Date(),
      resultedBy: userObjectId,
      verifiedAt: new Date(), // Set verification timestamp
      verifiedBy: userObjectId, // Set verifier to the same user who entered it
    });

    const savedResult = await result.save();

    // Emit real-time event
    this.realtimeGateway.notifyResultCreated(savedResult);

    return savedResult;
  }

  /**
   * Create multiple results in bulk (much faster than individual creates)
   * Uses upsert to handle existing results
   */
  async createBulk(
    createResultDtos: CreateResultDto[],
    userId?: string,
    userRoles: string[] = [],
  ): Promise<Result[]> {
    if (!createResultDtos || createResultDtos.length === 0) {
      return [];
    }

    const isReceptionistEntry = userRoles.includes(UserRoleEnum.RECEPTIONIST);
    const userObjectId = userId ? new Types.ObjectId(userId) : undefined;
    const now = new Date();

    // Fetch all subcategories in one query for efficiency
    const testCodes = [...new Set(createResultDtos.map(dto => dto.testCode))];
    const testCatalogs = await this.testCatalogModel
      .find({ code: { $in: testCodes } })
      .select('code subcategory unit')
      .lean();
    
    const subcategoryMap = new Map(
      testCatalogs.map(tc => [tc.code, tc.subcategory])
    );

    const unitMap = new Map(
      testCatalogs.map(tc => [tc.code, tc.unit])
    );

    // Prepare all results for bulk operation
    const bulkOps = await Promise.all(
      createResultDtos.map(async (dto) => {
        const orderObjectId = new Types.ObjectId(dto.orderId);
        const resolvedReferenceRange = await this.resolveReferenceRangeForResult(
          orderObjectId,
          dto.testCode,
          isReceptionistEntry ? undefined : dto.referenceRange,
          dto.menstrualPhase,
        );

        const normalizedValue =
          this.normalizeMchcValue(dto.testCode, dto.value) || dto.value;
        const normalizedReferenceRange = this.normalizeMchcRange(
          dto.testCode,
          resolvedReferenceRange,
        );
        const normalizedUnit = this.normalizeMchcUnit(
          dto.testCode,
          dto.unit || unitMap.get(dto.testCode),
        );

        const flag = dto.flag || this.calculateFlag(normalizedValue, normalizedReferenceRange);

        const resultData = {
          ...dto,
          value: normalizedValue,
          unit: normalizedUnit,
          orderId: orderObjectId,
          orderTestId: dto.orderTestId ? new Types.ObjectId(dto.orderTestId) : undefined,
          referenceRange: normalizedReferenceRange,
          subcategory: subcategoryMap.get(dto.testCode),
          flag,
          status: ResultStatusEnum.VERIFIED,
          resultedAt: now,
          resultedBy: userObjectId,
          verifiedAt: now,
          verifiedBy: userObjectId,
        };

        // Use updateOne with upsert to handle existing results
        return {
          updateOne: {
            filter: { orderId: orderObjectId, testCode: dto.testCode },
            update: { $set: resultData },
            upsert: true,
          },
        };
      })
    );

    // Execute bulk write operation
    await this.resultModel.bulkWrite(bulkOps);

    // Fetch the saved results to return them
    const orderIds = [...new Set(createResultDtos.map(dto => dto.orderId))];
    const savedTestCodes = createResultDtos.map(dto => dto.testCode);
    
    const savedResults = await this.resultModel.find({
      orderId: { $in: orderIds.map(id => new Types.ObjectId(id)) },
      testCode: { $in: savedTestCodes },
    }).exec();

    // Emit real-time events for all results
    savedResults.forEach(result => {
      this.realtimeGateway.notifyResultCreated(result);
    });

    return savedResults;
  }

  /**
   * Find all results with optional filters
   */
  async findAll(filters?: {
    orderId?: string;
    testCode?: string;
    status?: ResultStatusEnum;
    flag?: ResultFlagEnum;
    page?: number;
    limit?: number;
  }): Promise<{ results: Result[]; total: number; page: number; limit: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    const query: any = {};

    if (filters?.orderId) {
      query.orderId = new Types.ObjectId(filters.orderId);
    }

    if (filters?.testCode) {
      query.testCode = filters.testCode;
    }

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.flag) {
      query.flag = filters.flag;
    }

    const [results, total] = await Promise.all([
      this.resultModel
        .find(query)
        .populate('orderId', 'orderNumber patientId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.resultModel.countDocuments(query).exec(),
    ]);

    return { results: results as unknown as Result[], total, page, limit };
  }

  /**
   * Find result by ID
   */
  async findOne(id: string): Promise<Result> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid result ID');
    }

    const result = await this.resultModel
      .findById(id)
      .populate('orderId', 'orderNumber patientId')
      .populate('orderTestId')
      .populate('resultedBy', 'fullName email')
      .populate('verifiedBy', 'fullName email')
      .populate('amendedFrom')
      .exec();

    if (!result) {
      throw new NotFoundException(`Result with ID ${id} not found`);
    }

    return result;
  }

  /**
   * Update a result
   */
  async update(
    id: string,
    updateResultDto: UpdateResultDto,
  ): Promise<Result> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid result ID');
    }

    const result = await this.resultModel.findById(id).exec();
    if (!result) {
      throw new NotFoundException(`Result with ID ${id} not found`);
    }

    if (this.isMchcTest(result.testCode)) {
      if (updateResultDto.value !== undefined) {
        updateResultDto.value =
          this.normalizeMchcValue(result.testCode, updateResultDto.value) ||
          updateResultDto.value;
      }

      if (updateResultDto.referenceRange !== undefined) {
        updateResultDto.referenceRange =
          this.normalizeMchcRange(result.testCode, updateResultDto.referenceRange) ||
          updateResultDto.referenceRange;
      }

      updateResultDto.unit = this.normalizeMchcUnit(
        result.testCode,
        updateResultDto.unit || result.unit,
      );
    }

    // Recalculate flag if value or reference range changed
    if (updateResultDto.value || updateResultDto.referenceRange) {
      const currentValue =
        this.normalizeMchcValue(result.testCode, result.value) || result.value;
      const value = updateResultDto.value || currentValue;
      const resolvedReferenceRange =
        updateResultDto.referenceRange ||
        result.referenceRange ||
        (await this.resolveReferenceRangeForResult(result.orderId, result.testCode, undefined, result.menstrualPhase));
      const referenceRange = this.normalizeMchcRange(result.testCode, resolvedReferenceRange);

      if (!updateResultDto.referenceRange && referenceRange && !result.referenceRange) {
        updateResultDto.referenceRange = referenceRange;
      }

      updateResultDto.flag = this.calculateFlag(value, referenceRange);
    }

    Object.assign(result, updateResultDto);
    return result.save();
  }

  /**
   * Verify a result
   */
  async verify(id: string, userId?: string): Promise<Result> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid result ID');
    }

    const result = await this.resultModel.findById(id).exec();
    if (!result) {
      throw new NotFoundException(`Result with ID ${id} not found`);
    }

    if (result.status === ResultStatusEnum.VERIFIED) {
      throw new BadRequestException('Result is already verified');
    }

    result.status = ResultStatusEnum.VERIFIED;
    result.verifiedAt = new Date();
    result.verifiedBy = userId ? new Types.ObjectId(userId) : undefined;

    const savedResult = await result.save();

    // Emit real-time event
    this.realtimeGateway.notifyResultVerified(savedResult);

    return savedResult;
  }

  /**
   * Amend a result with reason tracking
   */
  async amend(
    id: string,
    amendResultDto: AmendResultDto,
    userId?: string,
  ): Promise<Result> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid result ID');
    }

    const originalResult = await this.resultModel.findById(id).exec();
    if (!originalResult) {
      throw new NotFoundException(`Result with ID ${id} not found`);
    }

    const normalizedNewValue =
      this.normalizeMchcValue(originalResult.testCode, amendResultDto.newValue) ||
      amendResultDto.newValue;
    const normalizedReferenceRange = this.normalizeMchcRange(
      originalResult.testCode,
      originalResult.referenceRange,
    );
    const normalizedUnit = this.normalizeMchcUnit(
      originalResult.testCode,
      originalResult.unit,
    );

    // Amend in place to avoid duplicate-key conflicts with the unique
    // orderId+testCode index while preserving amendment metadata.
    originalResult.value = normalizedNewValue;
    originalResult.unit = normalizedUnit;
    originalResult.referenceRange = normalizedReferenceRange;
    originalResult.flag = this.calculateFlag(
      normalizedNewValue,
      normalizedReferenceRange,
    );
    originalResult.status = ResultStatusEnum.AMENDED;
    originalResult.resultedAt = new Date();
    originalResult.resultedBy = userId ? new Types.ObjectId(userId) : undefined;
    originalResult.amendmentReason = amendResultDto.reason;

    if (!originalResult.amendedFrom) {
      originalResult.amendedFrom = originalResult._id;
    }

    return originalResult.save();
  }

  /**
   * Get results pending verification
   */
  async findPendingVerification(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ results: Result[]; total: number; page: number; limit: number }> {
    return this.findAll({
      status: ResultStatusEnum.PRELIMINARY,
      page,
      limit,
    });
  }

  /**
   * Get critical results
   */
  async findCritical(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ results: Result[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;

    const query = {
      flag: {
        $in: [ResultFlagEnum.CRITICAL_LOW, ResultFlagEnum.CRITICAL_HIGH],
      },
    };

    const [results, total] = await Promise.all([
      this.resultModel
        .find(query)
        .populate('orderId', 'orderNumber patientId')
        .populate('resultedBy', 'fullName email')
        .populate('verifiedBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.resultModel.countDocuments(query).exec(),
    ]);

    return { results, total, page, limit };
  }

  /**
   * Delete a result (admin only)
   */
  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid result ID');
    }

    const result = await this.resultModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Result with ID ${id} not found`);
    }
  }
}
