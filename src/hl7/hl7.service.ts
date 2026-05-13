import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as net from 'net';
import { CommunicationLog } from '../database/schemas/communication-log.schema';
import { Result } from '../database/schemas/result.schema';
import { Order } from '../database/schemas/order.schema';
import { OrderTest } from '../database/schemas/order-test.schema';
import { Machine } from '../database/schemas/machine.schema';
import { Patient } from '../database/schemas/patient.schema';
import { RealtimeGateway } from '../realtime/realtime.gateway';

interface ParsedHL7Message {
  messageType: string;
  messageControlId: string;
  patientId?: string;
  orderId?: string;
  results?: Array<{
    testCode: string;
    testName: string;
    value: string;
    unit?: string;
    referenceRange?: string;
    abnormalFlag?: string;
  }>;
}

interface ParsedASTMMessage {
  recordType: string;
  patientId?: string;
  orderId?: string;
  results?: Array<{
    testCode: string;
    value: string;
    unit?: string;
    referenceRange?: string;
  }>;
}

/**
 * Mapping from analyzer test codes (sent by Zybio Z52 via HL7) to LIS catalog codes.
 * Keys = code the analyzer sends, Values = code used in the LIS test catalog / order_tests.
 * Only codes that differ need to be listed here.
 */
const ANALYZER_TO_LIS_CODE: Record<string, string> = {
  'HGB':    'HB',       // Hemoglobin
  'RDW-CV': 'RDWCV',    // Red Cell Distribution Width - CV
  'RDW-SD': 'RDWSD',    // Red Cell Distribution Width - SD
  'RDW':    'RDWCV',    // Some analyzers send plain RDW for CV
  'PCT':    'PLTCT',    // Plateletcrit (avoid clash with Procalcitonin)
  'P-LCR':  'PLCR',    // Platelet Large Cell Ratio
  'P-LCC':  'PLCC',    // Platelet Large Cell Count
  'LYMPH%': 'LYMPH',   // Lymphocytes %
  'MONO%':  'MONO',    // Monocytes %
  'NEUT%':  'NEUT',    // Neutrophils %
  'EOS%':   'EOS',     // Eosinophils %
  'BASO%':  'BASO',    // Basophils %
  'LYMPH#': 'LYMPHA',  // Lymphocytes absolute
  'MONO#':  'MONOA',   // Monocytes absolute
  'NEUT#':  'NEUTA',   // Neutrophils absolute
  'EOS#':   'EOSA',    // Eosinophils absolute
  'BASO#':  'BASOA',   // Basophils absolute
  'Hb':     'HB',      // Case variant
  'Hgb':    'HB',      // Case variant
};

@Injectable()
export class Hl7Service {
  private readonly logger = new Logger(Hl7Service.name);
  private static readonly MCHC_TEST_CODE = 'MCHC';

  /**
   * Map an analyzer test code to the LIS catalog code.
   * Falls back to the original code (uppercased) if no mapping exists.
   */
  private mapAnalyzerCode(analyzerCode: string): string {
    const trimmed = analyzerCode.trim();
    return ANALYZER_TO_LIS_CODE[trimmed] || ANALYZER_TO_LIS_CODE[trimmed.toUpperCase()] || trimmed.toUpperCase();
  }

  constructor(
    @InjectModel(CommunicationLog.name)
    private communicationLogModel: Model<CommunicationLog>,
    @InjectModel(Result.name)
    private resultModel: Model<Result>,
    @InjectModel(Order.name)
    private orderModel: Model<Order>,
    @InjectModel(OrderTest.name)
    private orderTestModel: Model<OrderTest>,
    @InjectModel(Machine.name)
    private machineModel: Model<Machine>,
    @InjectModel(Patient.name)
    private patientModel: Model<Patient>,
    private realtimeGateway: RealtimeGateway,
  ) {}

  private isMchcTest(testCode?: string): boolean {
    return (testCode || '').trim().toUpperCase() === Hl7Service.MCHC_TEST_CODE;
  }

  private formatScaledNumericValue(numericValue: number): string {
    if (!Number.isFinite(numericValue)) {
      return '';
    }

    return parseFloat(numericValue.toFixed(1)).toString();
  }

  private normalizeMchcValue(rawValue?: string): string | undefined {
    if (rawValue === undefined || rawValue === null) {
      return rawValue;
    }

    const value = String(rawValue).trim();
    if (!value) {
      return value;
    }

    const numericValue = parseFloat(value);
    if (Number.isNaN(numericValue)) {
      return value;
    }

    const normalizedValue = numericValue > 100 ? numericValue / 10 : numericValue;
    return this.formatScaledNumericValue(normalizedValue);
  }

  private normalizeMchcRange(rawRange?: string): string | undefined {
    if (rawRange === undefined || rawRange === null) {
      return rawRange;
    }

    const range = String(rawRange).trim();
    if (!range) {
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

    return sanitizedRange.replace(/-?\d*\.?\d+/g, (token) => {
      const numericValue = parseFloat(token);
      if (Number.isNaN(numericValue)) {
        return token;
      }

      const normalizedValue = numericValue > 100 ? numericValue / 10 : numericValue;
      return this.formatScaledNumericValue(normalizedValue);
    });
  }

  private normalizeMchcAnalyzerResult<T extends { testCode?: string; value?: string; unit?: string; referenceRange?: string }>(
    result: T,
  ): T {
    if (!this.isMchcTest(result.testCode)) {
      return result;
    }

    return {
      ...result,
      value: this.normalizeMchcValue(result.value),
      unit: 'g/dL',
      referenceRange: this.normalizeMchcRange(result.referenceRange),
    };
  }

  /**
   * Parse HL7 message
   */
  parseHL7Message(message: string): ParsedHL7Message {
    const segments = message.split('\r').filter((s) => s.trim());
    const parsed: ParsedHL7Message = {
      messageType: '',
      messageControlId: '',
      results: [],
    };

    for (const segment of segments) {
      const fields = segment.split('|');
      const segmentType = fields[0];

      if (segmentType === 'MSH') {
        // Message Header
        parsed.messageType = fields[8] || '';
        parsed.messageControlId = fields[9] || '';
      } else if (segmentType === 'PID') {
        // Patient Identification
        parsed.patientId = fields[3] || '';
      } else if (segmentType === 'OBR') {
        // Observation Request
        parsed.orderId = fields[2] || fields[3] || '';
      } else if (segmentType === 'OBX') {
        // Observation Result
        const rawResult = {
          testCode: fields[3]?.split('^')[0] || '',
          testName: fields[3]?.split('^')[1] || '',
          value: fields[5] || '',
          unit: fields[6] || '',
          referenceRange: fields[7] || '',
          abnormalFlag: fields[8] || '',
        };
        const result = this.normalizeMchcAnalyzerResult(rawResult);
        if (!parsed.results) parsed.results = [];
        parsed.results.push(result);
      }
    }

    return parsed;
  }

  /**
   * Parse ASTM message
   */
  parseASTMMessage(message: string): ParsedASTMMessage {
    const records = message.split('\r').filter((r) => r.trim());
    const parsed: ParsedASTMMessage = {
      recordType: '',
      results: [],
    };

    for (const record of records) {
      const fields = record.split('|');
      const recordType = fields[0];

      if (recordType === 'H') {
        // Header Record
        parsed.recordType = 'ASTM';
      } else if (recordType === 'P') {
        // Patient Record
        parsed.patientId = fields[2] || '';
      } else if (recordType === 'O') {
        // Order Record
        parsed.orderId = fields[2] || '';
      } else if (recordType === 'R') {
        // Result Record
        const rawResult = {
          testCode: fields[2]?.split('^')[3] || '',
          value: fields[3] || '',
          unit: fields[4] || '',
          referenceRange: fields[5] || '',
        };
        const result = this.normalizeMchcAnalyzerResult(rawResult);
        if (!parsed.results) parsed.results = [];
        parsed.results.push(result);
      }
    }

    return parsed;
  }

  /**
   * Parse LIS2-A2 message (similar to ASTM)
   */
  parseLIS2A2Message(message: string): ParsedASTMMessage {
    // LIS2-A2 is similar to ASTM, reuse parser
    return this.parseASTMMessage(message);
  }

  /**
   * Generate HL7 ACK message
   */
  generateHL7Ack(messageControlId: string, status: 'AA' | 'AE' | 'AR'): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '')
      .substring(0, 14);
    
    const ack = [
      `MSH|^~\\&|LIS|LAB|ANALYZER|LAB|${timestamp}||ACK|${messageControlId}|P|2.5`,
      `MSA|${status}|${messageControlId}`,
    ].join('\r');

    return ack + '\r';
  }

  /**
   * Generate ASTM ACK message
   */
  generateASTMAck(status: 'ACK' | 'NAK'): string {
    return `${status}\r`;
  }

  /**
   * Process HL7 message
   */
  async processHL7Message(
    message: string,
    machineId: string,
  ): Promise<{ ack: string; results: any[] }> {
    this.logger.log(`Processing HL7 message from machine ${machineId}`);

    // Log incoming message
    const logEntry = await this.logCommunication(
      machineId,
      'HL7',
      'inbound',
      'ORU',
      message,
      'processing',
    );

    try {
      // Parse message
      const parsed = this.parseHL7Message(message);

      // Validate message
      if (!parsed.messageControlId) {
        throw new BadRequestException('Invalid HL7 message: missing control ID');
      }

      // Find order
      const order = await this.findOrder(parsed.orderId, parsed.patientId);
      if (!order) {
        this.logger.warn(
          `Order not found for HL7 message: ${parsed.orderId || parsed.patientId}`,
        );
        await this.updateCommunicationLog(logEntry._id, 'failed', 'Order not found');
        return {
          ack: this.generateHL7Ack(parsed.messageControlId, 'AE'),
          results: [],
        };
      }

      // Store results
      const results = await this.storeResults(order._id, parsed.results || [], machineId);

      // Update machine status
      await this.updateMachineStatus(machineId, 'online');

      // Update log
      await this.updateCommunicationLog(logEntry._id, 'success');

      // Generate ACK
      const ack = this.generateHL7Ack(parsed.messageControlId, 'AA');

      this.logger.log(
        `Successfully processed HL7 message: ${results.length} results stored`,
      );

      return { ack, results };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error processing HL7 message: ${errorMessage}`);
      await this.updateCommunicationLog(logEntry._id, 'failed', errorMessage);
      throw error;
    }
  }

  /**
   * Process ASTM message
   */
  async processASTMMessage(
    message: string,
    machineId: string,
  ): Promise<{ ack: string; results: any[] }> {
    this.logger.log(`Processing ASTM message from machine ${machineId}`);

    // Log incoming message
    const logEntry = await this.logCommunication(
      machineId,
      'ASTM',
      'inbound',
      'RESULT',
      message,
      'processing',
    );

    try {
      // Parse message
      const parsed = this.parseASTMMessage(message);

      // Find order
      const order = await this.findOrder(parsed.orderId, parsed.patientId);
      if (!order) {
        this.logger.warn(
          `Order not found for ASTM message: ${parsed.orderId || parsed.patientId}`,
        );
        await this.updateCommunicationLog(logEntry._id, 'failed', 'Order not found');
        return { ack: this.generateASTMAck('NAK'), results: [] };
      }

      // Store results
      const results = await this.storeResults(order._id, parsed.results || [], machineId);

      // Update machine status
      await this.updateMachineStatus(machineId, 'online');

      // Update log
      await this.updateCommunicationLog(logEntry._id, 'success');

      // Generate ACK
      const ack = this.generateASTMAck('ACK');

      this.logger.log(
        `Successfully processed ASTM message: ${results.length} results stored`,
      );

      return { ack, results };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error processing ASTM message: ${errorMessage}`);
      await this.updateCommunicationLog(logEntry._id, 'failed', errorMessage);
      throw error;
    }
  }

  /**
   * Process LIS2-A2 message
   */
  async processLIS2A2Message(
    message: string,
    machineId: string,
  ): Promise<{ ack: string; results: any[] }> {
    this.logger.log(`Processing LIS2-A2 message from machine ${machineId}`);
    // LIS2-A2 processing is similar to ASTM
    return this.processASTMMessage(message, machineId);
  }

  /**
   * Find order by order ID or patient ID
   */
  private async findOrder(
    orderId?: string,
    patientId?: string,
  ): Promise<Order | null> {
    if (orderId) {
      // Try orderNumber first, then try as MongoDB ObjectId
      const byNumber = await this.orderModel.findOne({ orderNumber: orderId });
      if (byNumber) return byNumber;

      if (Types.ObjectId.isValid(orderId)) {
        const byId = await this.orderModel.findById(orderId);
        if (byId) return byId;
      }
    }
    if (patientId) {
      // Find most recent non-completed, non-cancelled order for patient
      let patientObjectId: Types.ObjectId;
      if (Types.ObjectId.isValid(patientId)) {
        patientObjectId = new Types.ObjectId(patientId);
      } else {
        // Try to find patient by patientId string
        const patient = await this.patientModel.findOne({ patientId });
        if (!patient) return null;
        patientObjectId = patient._id;
      }
      return this.orderModel
        .findOne({
          patientId: patientObjectId,
          status: { $in: ['pending_collection', 'collected', 'processing'] },
        })
        .sort({ createdAt: -1 });
    }
    return null;
  }

  /**
   * Store results in database
   */
  private async storeResults(
    orderId: Types.ObjectId,
    results: any[],
    machineId: string,
  ): Promise<Result[]> {
    const storedResults: Result[] = [];

    // Pre-fetch order tests for this order so we can link results
    const orderTests = await this.orderTestModel.find({ orderId }).exec();
    const orderTestByCode = new Map<string, any>();
    for (const ot of orderTests) {
      orderTestByCode.set((ot as any).testCode?.toUpperCase(), ot);
    }

    // Get machine info for notifications
    const machine = await this.machineModel.findById(machineId).exec();
    const machineName = machine?.name || 'Unknown Analyzer';

    // Get order info for notifications
    const order = await this.orderModel.findById(orderId).exec();

    for (const result of results) {
      const normalizedResult = this.normalizeMchcAnalyzerResult(result);

      // Map analyzer code (e.g. HGB) to LIS catalog code (e.g. HB)
      const lisCode = this.mapAnalyzerCode(normalizedResult.testCode || '');
      const matchedOrderTest = orderTestByCode.get(lisCode);

      const newResult = new this.resultModel({
        orderId,
        testCode: lisCode,
        testName: matchedOrderTest?.testName || normalizedResult.testName || lisCode,
        value: normalizedResult.value,
        unit: normalizedResult.unit,
        referenceRange: normalizedResult.referenceRange,
        flag: this.mapAbnormalFlag(normalizedResult.abnormalFlag),
        status: 'preliminary',
        source: 'automated',
        machineId: new Types.ObjectId(machineId),
        resultedAt: new Date(),
        ...(matchedOrderTest ? { orderTestId: matchedOrderTest._id, panelCode: matchedOrderTest.panelCode, panelName: matchedOrderTest.panelName } : {}),
      });

      const saved = await newResult.save();
      storedResults.push(saved);

      // Emit WebSocket event for this result
      this.realtimeGateway.notifyResultCreated({
        _id: saved._id,
        testCode: lisCode,
        testName: saved.testName,
        value: saved.value,
        flag: saved.flag,
        orderId: orderId.toString(),
        orderNumber: order?.orderNumber,
        source: 'automated',
        machineName,
      });

      // If result doesn't match any order test, emit unmatched event
      if (!matchedOrderTest) {
        this.realtimeGateway.notifyUnmatchedResult({
          testCode: lisCode,
          testName: normalizedResult.testName || lisCode,
          value: normalizedResult.value,
          unit: normalizedResult.unit,
          machineName,
          machineId,
          orderId: orderId.toString(),
          orderNumber: order?.orderNumber,
        });
      }

      this.logger.debug(`Stored result: ${normalizedResult.testCode} -> ${lisCode} = ${normalizedResult.value} (matched OT: ${!!matchedOrderTest})`);
    }

    // Update order status to processing if not already
    await this.orderModel.findByIdAndUpdate(orderId, {
      $set: { status: 'processing' },
    });

    // Notify that order status changed
    if (order) {
      this.realtimeGateway.notifyOrderStatusChanged(orderId.toString(), 'processing', order.orderNumber);
    }

    // Notify that machine received results
    this.realtimeGateway.notifyMachineResultReceived({
      machineId,
      machineName,
      resultCount: storedResults.length,
      protocol: 'HL7/ASTM',
      autoMatched: true,
      orderId: orderId.toString(),
      orderNumber: order?.orderNumber,
    });

    return storedResults;
  }

  /**
   * Map HL7 abnormal flag to system flag
   */
  private mapAbnormalFlag(abnormalFlag?: string): string {
    if (!abnormalFlag) return 'normal';
    
    const flag = abnormalFlag.toUpperCase();
    if (flag.includes('LL') || flag.includes('CRITICAL LOW')) return 'critical_low';
    if (flag.includes('HH') || flag.includes('CRITICAL HIGH')) return 'critical_high';
    if (flag.includes('L') || flag.includes('LOW')) return 'low';
    if (flag.includes('H') || flag.includes('HIGH')) return 'high';
    
    return 'normal';
  }

  /**
   * Update machine status
   */
  private async updateMachineStatus(
    machineId: string,
    status: string,
  ): Promise<void> {
    const machine = await this.machineModel.findByIdAndUpdate(machineId, {
      $set: {
        status,
        lastCommunication: new Date(),
      },
    }, { new: true }).exec();

    // Emit WebSocket event for machine status change
    if (machine) {
      this.realtimeGateway.notifyMachineStatusChanged({
        _id: machine._id,
        name: machine.name,
        status: machine.status,
        lastCommunication: machine.lastCommunication,
      });
    }
  }

  /**
   * Log communication
   */
  private async logCommunication(
    machineId: string,
    protocol: string,
    direction: string,
    messageType: string,
    message: string,
    status: string,
    errorMessage?: string,
  ): Promise<CommunicationLog> {
    const log = new this.communicationLogModel({
      machineId: new Types.ObjectId(machineId),
      protocol,
      direction,
      messageType,
      message: message.substring(0, 5000), // Truncate to 5000 chars
      status,
      errorMessage,
      processingTime: 0,
    });

    return log.save();
  }

  /**
   * Update communication log
   */
  private async updateCommunicationLog(
    logId: Types.ObjectId,
    status: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.communicationLogModel.findByIdAndUpdate(logId, {
      $set: {
        status,
        errorMessage,
        processingTime: Date.now() - logId.getTimestamp().getTime(),
      },
    });
  }

  /**
   * Get communication logs with filters
   */
  async getCommunicationLogs(filters: {
    machineId?: string;
    protocol?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ logs: CommunicationLog[]; total: number }> {
    const query: any = {};

    if (filters.machineId) {
      query.machineId = new Types.ObjectId(filters.machineId);
    }
    if (filters.protocol) {
      query.protocol = filters.protocol;
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.createdAt.$lte = filters.endDate;
      }
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.communicationLogModel
        .find(query)
        .populate('machineId', 'name model')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.communicationLogModel.countDocuments(query),
    ]);

    return { logs, total };
  }

  /**
   * Get communication log by ID
   */
  async getCommunicationLogById(id: string): Promise<CommunicationLog> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid log ID');
    }

    const log = await this.communicationLogModel
      .findById(id)
      .populate('machineId', 'name model')
      .exec();

    if (!log) {
      throw new BadRequestException('Communication log not found');
    }

    return log;
  }

  /**
   * Generate HL7 ORM^O01 order message for sending to analyzer
   */
  generateHL7OrderMessage(
    order: Order & { patientId: Patient },
    tests: OrderTest[],
  ): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '')
      .substring(0, 14);

    const patient = order.patientId as unknown as Patient;
    const segments = [
      `MSH|^~\\&|LIS|LAB|ANALYZER|LAB|${timestamp}||ORM^O01|${order.orderNumber}|P|2.5`,
      `PID|1||${patient.patientId}||${patient.lastName}^${patient.firstName}||${patient.gender}|||${patient.address || ''}`,
      `PV1|1|O`,
    ];

    tests.forEach((test, idx) => {
      segments.push(
        `ORC|NW|${order.orderNumber}|||${order.priority === 'stat' ? 'S' : 'R'}`,
        `OBR|${idx + 1}|${order.orderNumber}||${test.testCode}^${test.testName}|||${timestamp}`,
      );
    });

    return segments.join('\r') + '\r';
  }

  /**
   * Generate ASTM order message for sending to analyzer
   */
  generateASTMOrderMessage(
    order: Order & { patientId: Patient },
    tests: OrderTest[],
  ): string {
    const patient = order.patientId as unknown as Patient;
    const records = [
      `H|\\^&|||LIS|||||LAB||P|1`,
      `P|1||${patient.patientId}||${patient.lastName}^${patient.firstName}||${patient.gender}`,
    ];

    tests.forEach((test, idx) => {
      records.push(
        `O|${idx + 1}|${order.orderNumber}||^^^${test.testCode}|${order.priority === 'stat' ? 'S' : 'R'}`,
      );
    });

    records.push('L|1|N');
    return records.join('\r') + '\r';
  }

  /**
   * Send order to a machine via TCP
   */
  async sendOrderToMachine(
    orderId: string,
    machineId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Validate IDs
    if (!Types.ObjectId.isValid(orderId) || !Types.ObjectId.isValid(machineId)) {
      throw new BadRequestException('Invalid order or machine ID');
    }

    const machine = await this.machineModel.findById(machineId).exec();
    if (!machine) {
      throw new BadRequestException('Machine not found');
    }
    if (!machine.ipAddress || !machine.port) {
      throw new BadRequestException('Machine has no IP address or port configured');
    }

    // Get order with patient populated
    const order = await this.orderModel
      .findById(orderId)
      .populate('patientId')
      .exec();
    if (!order) {
      throw new BadRequestException('Order not found');
    }

    const populatedOrder = order as any;
    const patient = populatedOrder.patientId as Patient;

    // Get order tests
    const tests = await this.orderTestModel
      .find({ orderId: new Types.ObjectId(orderId) })
      .exec();
    if (tests.length === 0) {
      throw new BadRequestException('No tests found for this order');
    }

    // Generate message based on machine protocol
    let message: string;
    if (machine.protocol === 'HL7') {
      message = this.generateHL7OrderMessage(populatedOrder, tests);
    } else if (machine.protocol === 'ASTM' || machine.protocol === 'LIS2_A2') {
      message = this.generateASTMOrderMessage(populatedOrder, tests);
    } else {
      throw new BadRequestException(`Protocol ${machine.protocol} does not support outbound orders`);
    }

    // Log outbound communication
    const logEntry = await this.logCommunication(
      machineId,
      machine.protocol,
      'outbound',
      'ORM',
      message,
      'processing',
    );

    // Send via TCP
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(10000);

      socket.connect(machine.port!, machine.ipAddress!, () => {
        socket.write(message);
        this.logger.log(`Order ${order.orderNumber} sent to ${machine.name}`);
      });

      let response = '';

      socket.on('data', (data) => {
        response += data.toString();
        // Check if we received an ACK
        if (response.includes('AA') || response.includes('ACK') || response.includes('MSA')) {
          socket.destroy();
          this.updateCommunicationLog(logEntry._id, 'success');
          this.updateMachineStatus(machineId, 'online');
          resolve({
            success: true,
            message: `Order ${order.orderNumber} sent successfully to ${machine.name}`,
          });
        }
      });

      socket.on('error', (err: Error) => {
        socket.destroy();
        this.updateCommunicationLog(logEntry._id, 'failed', err.message);
        resolve({ success: false, message: `Connection error: ${err.message}` });
      });

      socket.on('timeout', () => {
        socket.destroy();
        // Timeout means we didn't get ACK - mark as partial success
        this.updateCommunicationLog(logEntry._id, 'timeout', 'No ACK received within timeout');
        resolve({
          success: false,
          message: `Order sent to ${machine.name} but no ACK received - verify manually`,
        });
      });
    });
  }
}
