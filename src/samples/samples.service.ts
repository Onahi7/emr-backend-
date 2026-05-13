import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Sample, SampleStatusEnum } from '../database/schemas/sample.schema';
import { Order, OrderStatusEnum } from '../database/schemas/order.schema';
import { IdSequence } from '../database/schemas/id-sequence.schema';
import { CreateSampleDto } from './dto/create-sample.dto';
import { UpdateSampleDto } from './dto/update-sample.dto';
import { RejectSampleDto } from './dto/reject-sample.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class SamplesService {
  private readonly logger = new Logger(SamplesService.name);

  constructor(
    @InjectModel(Sample.name) private sampleModel: Model<Sample>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(IdSequence.name) private idSequenceModel: Model<IdSequence>,
    private realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Generate unique sample ID in format: SMP-YYYYMMDD-XXXX
   */
  private async generateSampleId(): Promise<string> {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

    const sequenceId = `sample_id_${datePart}`;

    // Find and increment the sequence atomically
    const sequence = await this.idSequenceModel.findByIdAndUpdate(
      sequenceId,
      {
        $inc: { currentValue: 1 },
        $setOnInsert: { prefix: 'SMP', datePart },
      },
      { upsert: true, new: true },
    );

    const paddedValue = sequence.currentValue.toString().padStart(4, '0');
    return `SMP-${datePart}-${paddedValue}`;
  }

  /**
   * Create a new sample
   */
  async create(createSampleDto: CreateSampleDto, userId?: string): Promise<Sample> {
    // Validate order ID
    if (!Types.ObjectId.isValid(createSampleDto.orderId)) {
      throw new BadRequestException('Invalid order ID');
    }

    // Validate patient ID
    if (!Types.ObjectId.isValid(createSampleDto.patientId)) {
      throw new BadRequestException('Invalid patient ID');
    }

    // Verify order exists
    const order = await this.orderModel.findById(createSampleDto.orderId).exec();
    if (!order) {
      throw new NotFoundException(`Order with ID ${createSampleDto.orderId} not found`);
    }

    // Check if order is in a valid state for sample collection
    if (order.status === OrderStatusEnum.CANCELLED) {
      throw new BadRequestException('Cannot collect samples for a cancelled order');
    }

    if (order.status === OrderStatusEnum.COMPLETED) {
      throw new BadRequestException('Order is already completed');
    }

    // Generate sample ID
    const sampleId = await this.generateSampleId();

    // Create sample
    const sample = new this.sampleModel({
      sampleId,
      orderId: new Types.ObjectId(createSampleDto.orderId),
      patientId: new Types.ObjectId(createSampleDto.patientId),
      sampleType: createSampleDto.sampleType,
      status: SampleStatusEnum.COLLECTED,
      collectedAt: new Date(),
      collectedBy: userId ? new Types.ObjectId(userId) : undefined,
    });

    const savedSample = await sample.save();

    // Update order status to collected if it's pending collection
    if (order.status === OrderStatusEnum.PENDING_COLLECTION) {
      order.status = OrderStatusEnum.COLLECTED;
      order.collectedAt = new Date();
      order.collectedBy = userId ? new Types.ObjectId(userId) : undefined;
      await order.save();
      this.logger.log(`Order status updated to collected: ${order.orderNumber}`);
    }

    this.logger.log(`Sample created: ${savedSample.sampleId}`);
    this.realtimeGateway.notifySampleCollected(savedSample);

    return this.findOne(savedSample._id.toString());
  }

  /**
   * Find all samples with filters
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    status?: string,
    orderId?: string,
    patientId?: string,
  ): Promise<{ data: Sample[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (status) {
      query.status = status;
    }

    if (orderId && Types.ObjectId.isValid(orderId)) {
      query.orderId = new Types.ObjectId(orderId);
    }

    if (patientId && Types.ObjectId.isValid(patientId)) {
      query.patientId = new Types.ObjectId(patientId);
    }

    const [data, total] = await Promise.all([
      this.sampleModel
        .find(query)
        .populate('orderId', 'orderNumber status priority')
        .populate('patientId', 'patientId firstName lastName')
        .populate('collectedBy', 'fullName email')
        .populate('rejectedBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.sampleModel.countDocuments(query).exec(),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Find sample by ID
   */
  async findOne(id: string): Promise<Sample> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Sample with ID ${id} not found`);
    }

    const sample = await this.sampleModel
      .findById(id)
      .populate('orderId', 'orderNumber status priority')
      .populate('patientId', 'patientId firstName lastName')
      .populate('collectedBy', 'fullName email')
      .populate('rejectedBy', 'fullName email')
      .exec();

    if (!sample) {
      throw new NotFoundException(`Sample with ID ${id} not found`);
    }

    return sample;
  }

  /**
   * Find sample by sample ID (SMP-YYYYMMDD-XXXX)
   */
  async findBySampleId(sampleId: string): Promise<Sample> {
    const sample = await this.sampleModel
      .findOne({ sampleId })
      .populate('orderId', 'orderNumber status priority')
      .populate('patientId', 'patientId firstName lastName')
      .populate('collectedBy', 'fullName email')
      .populate('rejectedBy', 'fullName email')
      .exec();

    if (!sample) {
      throw new NotFoundException(`Sample with ID ${sampleId} not found`);
    }

    return sample;
  }

  /**
   * Update sample
   */
  async update(id: string, updateSampleDto: UpdateSampleDto): Promise<Sample> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Sample with ID ${id} not found`);
    }

    const sample = await this.sampleModel
      .findByIdAndUpdate(id, updateSampleDto, { new: true })
      .populate('orderId', 'orderNumber status priority')
      .populate('patientId', 'patientId firstName lastName')
      .populate('collectedBy', 'fullName email')
      .populate('rejectedBy', 'fullName email')
      .exec();

    if (!sample) {
      throw new NotFoundException(`Sample with ID ${id} not found`);
    }

    this.logger.log(`Sample updated: ${sample.sampleId}`);
    return sample;
  }

  /**
   * Reject sample
   */
  async reject(
    id: string,
    rejectSampleDto: RejectSampleDto,
    userId?: string,
  ): Promise<Sample> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Sample with ID ${id} not found`);
    }

    const sample = await this.sampleModel.findById(id).exec();

    if (!sample) {
      throw new NotFoundException(`Sample with ID ${id} not found`);
    }

    if (sample.status === SampleStatusEnum.REJECTED) {
      throw new BadRequestException('Sample is already rejected');
    }

    if (sample.status === SampleStatusEnum.COMPLETED) {
      throw new BadRequestException('Cannot reject a completed sample');
    }

    sample.status = SampleStatusEnum.REJECTED;
    sample.rejectionReason = rejectSampleDto.reason;
    sample.rejectedAt = new Date();
    sample.rejectedBy = userId ? new Types.ObjectId(userId) : undefined;

    await sample.save();

    this.logger.log(`Sample rejected: ${sample.sampleId}`);

    return this.findOne(id);
  }
}
