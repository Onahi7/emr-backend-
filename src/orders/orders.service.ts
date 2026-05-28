import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderStatusEnum, OrderTypeEnum, PaymentStatusEnum, PaymentMethodEnum } from '../database/schemas/order.schema';
import { OrderTest } from '../database/schemas/order-test.schema';
import { IdSequence } from '../database/schemas/id-sequence.schema';
import { Patient } from '../database/schemas/patient.schema';
import { WalletTransaction, WalletTransactionTypeEnum } from '../database/schemas/wallet-transaction.schema';
import { Payment, PaymentTypeEnum } from '../database/schemas/payment.schema';
import { TestCatalog } from '../database/schemas/test-catalog.schema';
import { Doctor } from '../database/schemas/doctor.schema';
import { Visit, VisitStatusEnum } from '../database/schemas/visit.schema';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { AssignDoctorDto } from './dto/assign-doctor.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { LisIntegrationService } from '../lis-integration/lis-integration.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  private getEffectiveLinkedTests(testCode: string, configuredLinkedTests?: string[]): string[] {
    const linked = new Set((configuredLinkedTests || []).map((code) => code.toUpperCase()));

    // Safety fallback: CRP should always include HSCRP for result entry/report workflows.
    if ((testCode || '').toUpperCase() === 'CRP') {
      linked.add('HSCRP');
    }

    return Array.from(linked);
  }

  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(OrderTest.name) private orderTestModel: Model<OrderTest>,
    @InjectModel(IdSequence.name) private idSequenceModel: Model<IdSequence>,
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(TestCatalog.name) private testCatalogModel: Model<TestCatalog>,
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    private realtimeGateway: RealtimeGateway,
    private lisIntegrationService: LisIntegrationService,
  ) {}

  /**
   * Generate unique order number in format: ORD-YYYYMMDD-XXXX
   */
  private async generateOrderNumber(): Promise<string> {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

    const sequenceId = `order_number_${datePart}`;

    // Find and increment the sequence atomically
    const sequence = await this.idSequenceModel.findByIdAndUpdate(
      sequenceId,
      {
        $inc: { currentValue: 1 },
        $setOnInsert: { prefix: 'ORD', datePart },
      },
      { upsert: true, new: true },
    );

    const paddedValue = sequence.currentValue.toString().padStart(4, '0');
    return `ORD-${datePart}-${paddedValue}`;
  }

  /**
   * Calculate order total with discounts
   */
  private calculateTotal(
    subtotal: number,
    discount: number = 0,
    discountType?: string,
  ): number {
    if (discount < 0) {
      throw new BadRequestException('Discount cannot be negative');
    }

    let total = subtotal;

    if (discount > 0 && discountType) {
      if (discountType === 'percentage') {
        if (discount > 100) {
          throw new BadRequestException('Percentage discount cannot exceed 100%');
        }
        total = subtotal * (1 - discount / 100);
      } else if (discountType === 'fixed') {
        if (discount > subtotal) {
          throw new BadRequestException('Fixed discount cannot exceed subtotal');
        }
        total = subtotal - discount;
      }
    }

    // Round to 2 decimal places
    return Math.round(total * 100) / 100;
  }

  /**
   * Expand tests to include linked tests and panel components
   */
  private async expandLinkedTests(tests: any[]): Promise<any[]> {
    const expandedTests: any[] = [];
    const addedTestCodes = new Set<string>();

    for (const test of tests) {
      const testCode = (test.testCode || '').toUpperCase();
      if (addedTestCodes.has(testCode)) continue;

      // Look up the test in catalog
      const catalogTest = await this.testCatalogModel.findOne({ code: test.testCode }).lean();

      // If this is a panel, expand into component tests
      if (catalogTest?.isPanel && catalogTest.panelComponents && catalogTest.panelComponents.length > 0) {
        for (const component of catalogTest.panelComponents) {
          const compCode = (component.testCode || '').toUpperCase();
          if (!addedTestCodes.has(compCode)) {
            const compTest = await this.testCatalogModel.findOne({ code: component.testCode }).lean();
            if (compTest) {
              expandedTests.push({
                testId: compTest._id.toString(),
                testCode: compTest.code,
                testName: compTest.name,
                panelCode: catalogTest.code,
                panelName: catalogTest.name,
                category: compTest.category,
                subcategory: compTest.subcategory,
                price: 0, // Component tests included in panel price
              });
              addedTestCodes.add(compCode);
              this.logger.log(`Panel component added: ${compCode} for panel ${test.testCode}`);
            }
          }
        }
      } else {
        // Regular test - add it directly
        expandedTests.push({
          testId: test.testId,
          testCode: test.testCode,
          testName: test.testName,
          panelCode: catalogTest?.panelCode,
          panelName: catalogTest?.panelName,
          category: catalogTest?.category,
          subcategory: catalogTest?.subcategory,
          price: test.price,
        });
        addedTestCodes.add(testCode);

        // Also check for linked tests (e.g., CRP includes HSCRP)
        const linkedTests = this.getEffectiveLinkedTests(test.testCode, catalogTest?.linkedTests);
        for (const linkedTestCode of linkedTests) {
          const normalizedLinkedCode = (linkedTestCode || '').toUpperCase();
          if (!addedTestCodes.has(normalizedLinkedCode)) {
            const linkedTest = await this.testCatalogModel.findOne({ code: normalizedLinkedCode }).lean();
            if (linkedTest) {
              expandedTests.push({
                testId: linkedTest._id.toString(),
                testCode: linkedTest.code,
                testName: linkedTest.name,
                panelCode: linkedTest.panelCode,
                panelName: linkedTest.panelName,
                category: linkedTest.category,
                price: 0,
              });
              addedTestCodes.add(normalizedLinkedCode);
              this.logger.log(`Auto-added linked test: ${normalizedLinkedCode} for ${test.testCode}`);
            }
          }
        }
      }
    }

    return expandedTests;
  }

  /**
   * Create a new order
   */
  private getPaymentTypeForOrder(orderType: OrderTypeEnum): PaymentTypeEnum {
    return orderType === OrderTypeEnum.PHARMACY
      ? PaymentTypeEnum.PHARMACY_ORDER
      : PaymentTypeEnum.LAB_ORDER;
  }

  private getPaidStatusForOrder(orderType: OrderTypeEnum): OrderStatusEnum {
    if (orderType === OrderTypeEnum.LAB) return OrderStatusEnum.PENDING_COLLECTION;
    if (orderType === OrderTypeEnum.PHARMACY) return OrderStatusEnum.PAID;
    return OrderStatusEnum.PAID;
  }

  async create(createOrderDto: CreateOrderDto, userId?: string, branchId?: string): Promise<Order> {
    // Validate patient ID
    if (!Types.ObjectId.isValid(createOrderDto.patientId)) {
      throw new BadRequestException('Invalid patient ID');
    }

    const orderType = createOrderDto.orderType || OrderTypeEnum.LAB;
    if ((orderType === OrderTypeEnum.LAB || orderType === OrderTypeEnum.PHARMACY) && !createOrderDto.visitId) {
      throw new BadRequestException('Clinical lab and pharmacy orders must be attached to a patient visit');
    }

    // Validate visitId belongs to the same patient
    if (createOrderDto.visitId) {
      if (!Types.ObjectId.isValid(createOrderDto.visitId)) {
        throw new BadRequestException('Invalid visit ID');
      }
      const visit = await this.orderModel.db
        .collection('visits')
        .findOne({ _id: new Types.ObjectId(createOrderDto.visitId) });
      if (!visit) {
        throw new BadRequestException('Visit not found');
      }
      if (visit.patientId.toString() !== createOrderDto.patientId) {
        throw new BadRequestException('Visit does not belong to the specified patient');
      }
    }

    // Calculate subtotal
    const subtotal = createOrderDto.tests.reduce(
      (sum, test) => sum + test.price,
      0,
    );

    // Calculate total with discount
    const total = this.calculateTotal(
      subtotal,
      createOrderDto.discount,
      createOrderDto.discountType,
    );

    // Generate order number
    const orderNumber = await this.generateOrderNumber();

    // Preserve clinician-selected LIS orderable codes (panel/test) exactly as requested.
    const lisRequestedCodes = Array.from(
      new Set(
        (createOrderDto.tests || [])
          .map((t) => (t.testCode || '').toString().trim().toUpperCase())
          .filter(Boolean),
      ),
    );

    let doctorObjectId: Types.ObjectId | undefined;
    let referredByDoctor = createOrderDto.referredByDoctor?.trim();
    if (createOrderDto.doctorId) {
      if (!Types.ObjectId.isValid(createOrderDto.doctorId)) {
        throw new BadRequestException('Invalid doctor ID');
      }
      const doctor = await this.doctorModel.findById(createOrderDto.doctorId).lean();
      if (!doctor) throw new BadRequestException('Doctor not found');
      doctorObjectId = new Types.ObjectId(createOrderDto.doctorId);
      referredByDoctor = doctor.fullName;
    }

    // Determine initial payment amounts (split payments take precedence)
    let amountPaid = 0;
    if (createOrderDto.initialPayments && createOrderDto.initialPayments.length > 0) {
      const requestedTotal = createOrderDto.initialPayments.reduce((s, p) => s + p.amount, 0);
      amountPaid = Math.min(Math.round(requestedTotal * 100) / 100, total);
    } else if (createOrderDto.paymentMethod) {
      const initialAmount = createOrderDto.initialPaymentAmount ?? total;
      amountPaid = Math.min(Math.round(initialAmount * 100) / 100, total);
    }
    const balance = Math.round((total - amountPaid) * 100) / 100;
    let paymentStatus = PaymentStatusEnum.PENDING;
    if (amountPaid >= total) paymentStatus = PaymentStatusEnum.PAID;
    else if (amountPaid > 0) paymentStatus = PaymentStatusEnum.PARTIAL;

    const initialStatus = paymentStatus === PaymentStatusEnum.PAID
      ? this.getPaidStatusForOrder(orderType)
      : OrderStatusEnum.AWAITING_PAYMENT;

    // Create order
    const order = new this.orderModel({
      orderNumber,
      patientId: new Types.ObjectId(createOrderDto.patientId),
      visitId: createOrderDto.visitId ? new Types.ObjectId(createOrderDto.visitId) : undefined,
      branchId,
      orderType,
      status: initialStatus,
      priority: createOrderDto.priority,
      subtotal,
      discount: createOrderDto.discount || 0,
      discountType: createOrderDto.discountType,
      total,
      paymentStatus,
      paymentMethod: createOrderDto.paymentMethod,
      amountPaid,
      balance,
      notes: createOrderDto.notes,
      referredByDoctor,
      doctorId: doctorObjectId,
      orderedBy: userId ? new Types.ObjectId(userId) : undefined,
      lisRequestedCodes,
    });

    const savedOrder = await order.save();

    // For LAB orders, preserve exactly what EMR user selected so LIS remains source of truth.
    // For non-LAB orders, keep local expansion behavior.
    const expandedTests = orderType === OrderTypeEnum.LAB
      ? createOrderDto.tests.map((test) => ({
          testId: test.testId,
          testCode: test.testCode,
          testName: test.testName,
          panelCode: test.panelCode,
          panelName: test.panelName,
          category: undefined,
          subcategory: undefined,
          price: test.price,
        }))
      : await this.expandLinkedTests(createOrderDto.tests);

    // Create order tests
    const orderTests = expandedTests.map((test) => ({
      orderId: savedOrder._id,
      testId: Types.ObjectId.isValid(test.testId)
        ? new Types.ObjectId(test.testId)
        : undefined,
      testCode: test.testCode,
      testName: test.testName,
      panelCode: test.panelCode,
      panelName: test.panelName,
      category: test.category,
      price: test.price,
      status: 'pending',
    }));

    await this.orderTestModel.insertMany(orderTests);

    // Record initial payments (supports split payments)
    if (createOrderDto.initialPayments && createOrderDto.initialPayments.length > 0 && amountPaid > 0) {
      for (const p of createOrderDto.initialPayments) {
        if (p.amount > 0) {
          await this.paymentModel.create({
            orderId: savedOrder._id,
            paymentType: this.getPaymentTypeForOrder(orderType),
            amount: Math.round(p.amount * 100) / 100,
            paymentMethod: p.paymentMethod,
            receivedBy: userId ? new Types.ObjectId(userId) : undefined,
            notes: `Initial payment for order ${orderNumber}`,
          });
        }
      }
    } else if (createOrderDto.paymentMethod && amountPaid > 0) {
      await this.paymentModel.create({
        orderId: savedOrder._id,
        paymentType: this.getPaymentTypeForOrder(orderType),
        amount: amountPaid,
        paymentMethod: createOrderDto.paymentMethod,
        receivedBy: userId ? new Types.ObjectId(userId) : undefined,
        notes: `Initial payment for order ${orderNumber}`,
      });
    }

    this.logger.log(`Order created: ${savedOrder.orderNumber}`);

    const populatedOrder = await this.findOne(savedOrder._id.toString(), branchId);

    // Sync visit status if this order belongs to a visit
    if (savedOrder.visitId) {
      await this.syncVisitStatus(savedOrder.visitId as Types.ObjectId);
    }

    // Emit real-time event
    this.realtimeGateway.notifyOrderCreated(populatedOrder);

    if (savedOrder.orderType === OrderTypeEnum.LAB) {
      void this.lisIntegrationService.syncOrderToLis(savedOrder._id.toString());
    }

    return populatedOrder;
  }

  /**
   * Find all orders with filters and pagination
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    status?: string,
    patientId?: string,
    search?: string,
    orderType?: OrderTypeEnum,
    branchId?: string,
  ): Promise<{ data: Order[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (status) {
      query.status = status;
    }

    if (patientId && Types.ObjectId.isValid(patientId)) {
      query.patientId = new Types.ObjectId(patientId);
    }

    if (orderType) {
      query.orderType = orderType;
    }

    if (search) {
      query.orderNumber = { $regex: search, $options: 'i' };
    }

    if (branchId) {
      query.branchId = branchId;
    }

    const [data, total] = await Promise.all([
      this.orderModel
        .find(query)
        .populate('patientId', 'patientId firstName lastName age gender')
        .populate('doctorId', 'fullName phone facility')
        .populate('orderedBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.orderModel.countDocuments(query).exec(),
    ]);

    // Attach order_tests so all list views show test names/codes
    const dataWithTests = await Promise.all(
      data.map(async (order) => {
        const tests = await this.orderTestModel
          .find({ orderId: order._id })
          .lean()
          .exec();
        return { ...order, order_tests: tests };
      }),
    );

    return { data: dataWithTests as unknown as Order[], total, page, limit };
  }

  /**
   * Find order by ID
   */
  async findOne(id: string, branchId?: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const filter: any = { _id: id };
    if (branchId) {
      filter.branchId = branchId;
    }

    const order = await this.orderModel
      .findOne(filter)
      .populate('patientId', 'patientId firstName lastName age gender')
      .populate('orderedBy', 'fullName email')
      .populate('doctorId', 'fullName phone facility')
      .populate('collectedBy', 'fullName email')
      .populate('cancelledBy', 'fullName email')
      .lean()
      .exec();

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const orderTests = await this.orderTestModel
      .find({ orderId: new Types.ObjectId(id) })
      .populate('testId')
      .lean()
      .exec();

    return { ...order, order_tests: orderTests };
  }

  /**
   * Find order by order number
   */
  async findByOrderNumber(orderNumber: string, branchId?: string): Promise<Order> {
    const filter: any = { orderNumber };
    if (branchId) {
      filter.branchId = branchId;
    }

    const order = await this.orderModel
      .findOne(filter)
      .populate('patientId', 'patientId firstName lastName age gender')
      .populate('orderedBy', 'fullName email')
      .populate('doctorId', 'fullName phone facility')
      .populate('collectedBy', 'fullName email')
      .populate('cancelledBy', 'fullName email')
      .exec();

    if (!order) {
      throw new NotFoundException(`Order with number ${orderNumber} not found`);
    }

    return order;
  }

  /**
   * Get order tests
   */
  async getOrderTests(orderId: string): Promise<OrderTest[]> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    const tests = await this.orderTestModel
      .find({ orderId: new Types.ObjectId(orderId) })
      .populate('testId')
      .populate('machineId')
      .populate('sampleId')
      .exec();

    return tests;
  }

  /**
   * Update order — supports test replacement, priority, notes, discount.
   * Business rules:
   *  - Tests can only be replaced while status is awaiting_payment (not yet paid)
   *  - Priority and notes can be edited while awaiting_payment or pending_collection
   *  - Payment-related fields (paymentStatus, paymentMethod) are ignored here —
   *    use markAsPaid / addPayment endpoints instead.
   */
  async update(id: string, updateOrderDto: UpdateOrderDto, branchId?: string): Promise<Order> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const filter: any = { _id: id };
    if (branchId) {
      filter.branchId = branchId;
    }

    const order = await this.orderModel.findOne(filter).exec();
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const editableStatuses = [OrderStatusEnum.AWAITING_PAYMENT, OrderStatusEnum.PENDING_COLLECTION];
    if (!editableStatuses.includes(order.status)) {
      throw new BadRequestException(
        `Cannot edit order in "${order.status}" status. Only orders awaiting payment or pending collection can be edited.`,
      );
    }

    let testsChanged = false;

    // --- Replace tests (only allowed before payment) ---
    if (updateOrderDto.tests && updateOrderDto.tests.length > 0) {
      if (order.status !== OrderStatusEnum.AWAITING_PAYMENT) {
        throw new BadRequestException('Tests can only be edited before the order is paid');
      }

      // Delete existing order tests
      await this.orderTestModel.deleteMany({ orderId: order._id }).exec();

      // Expand linked tests / panels
      const expandedTests = order.orderType === OrderTypeEnum.LAB
        ? updateOrderDto.tests.map((test) => ({
            testId: test.testId,
            testCode: test.testCode,
            testName: test.testName,
            panelCode: test.panelCode,
            panelName: test.panelName,
            category: undefined,
            subcategory: undefined,
            price: test.price,
          }))
        : await this.expandLinkedTests(updateOrderDto.tests);

      // Create new order tests
      const orderTests = expandedTests.map((test) => ({
        orderId: order._id,
        testId: Types.ObjectId.isValid(test.testId)
          ? new Types.ObjectId(test.testId)
          : undefined,
        testCode: test.testCode,
        testName: test.testName,
        panelCode: test.panelCode,
        panelName: test.panelName,
        category: test.category,
        price: test.price,
        status: 'pending',
      }));

      await this.orderTestModel.insertMany(orderTests);

      // Recalculate totals
      const subtotal = updateOrderDto.tests.reduce((sum, test) => sum + test.price, 0);
      const discount = updateOrderDto.discount ?? order.discount ?? 0;
      const discountType = updateOrderDto.discountType ?? order.discountType;
      const total = this.calculateTotal(subtotal, discount, discountType);

      order.subtotal = subtotal;
      order.total = total;
      order.discount = discount;
      order.discountType = discountType as any;
      order.balance = Math.round((total - order.amountPaid) * 100) / 100;

      // Update LIS requested codes for lab orders
      if (order.orderType === OrderTypeEnum.LAB) {
        order.lisRequestedCodes = Array.from(
          new Set(
            updateOrderDto.tests
              .map((t) => (t.testCode || '').toString().trim().toUpperCase())
              .filter(Boolean),
          ),
        );
      }

      testsChanged = true;
    }

    // --- Update priority ---
    if (updateOrderDto.priority) {
      order.priority = updateOrderDto.priority;
    }

    // --- Update notes ---
    if (updateOrderDto.notes !== undefined) {
      order.notes = updateOrderDto.notes;
    }

    // --- Update discount (without tests) ---
    if (updateOrderDto.discount !== undefined && !updateOrderDto.tests) {
      const discount = updateOrderDto.discount;
      const discountType = updateOrderDto.discountType ?? order.discountType;
      const total = this.calculateTotal(order.subtotal, discount, discountType);
      order.discount = discount;
      order.discountType = discountType as any;
      order.total = total;
      order.balance = Math.round((total - order.amountPaid) * 100) / 100;
    }

    await order.save();

    this.logger.log(`Order updated: ${order.orderNumber}${testsChanged ? ' (tests replaced)' : ''}`);

    const populatedOrder = await this.findOne(id, branchId);

    // Emit real-time event
    this.realtimeGateway.notifyOrderUpdated(populatedOrder);

    // Re-sync to LIS if tests changed on an already-synced order
    if (testsChanged && order.orderType === OrderTypeEnum.LAB && order.lisExternalRequestId) {
      void this.lisIntegrationService.syncOrderToLis(id);
    }

    return populatedOrder;
  }

  /**
   * Cancel order
   */
  async cancel(
    id: string,
    cancelOrderDto: CancelOrderDto,
    userId?: string,
    branchId?: string,
  ): Promise<Order> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const filter: any = { _id: id };
    if (branchId) {
      filter.branchId = branchId;
    }

    const order = await this.orderModel.findOne(filter).exec();

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    if (order.status === OrderStatusEnum.CANCELLED) {
      throw new BadRequestException('Order is already cancelled');
    }

    if (order.status === OrderStatusEnum.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed order');
    }

    order.status = OrderStatusEnum.CANCELLED;
    order.cancelledAt = new Date();
    order.cancelledBy = userId ? new Types.ObjectId(userId) : undefined;
    order.cancellationReason = cancelOrderDto.reason;

    await order.save();

    this.logger.log(`Order cancelled: ${order.orderNumber}`);

    const populatedOrder = await this.findOne(id, branchId);

    // Emit real-time event
    this.realtimeGateway.notifyOrderStatusChanged(
      order._id.toString(),
      order.status,
      order.orderNumber,
    );

    return populatedOrder;
  }

  /**
   * Mark samples as collected
   */
  async collect(id: string, userId?: string, branchId?: string): Promise<Order> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const filter: any = { _id: id };
    if (branchId) {
      filter.branchId = branchId;
    }

    const order = await this.orderModel.findOne(filter).exec();

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    if (order.status === OrderStatusEnum.CANCELLED) {
      throw new BadRequestException('Cannot collect samples for a cancelled order');
    }

    if (order.status === OrderStatusEnum.COMPLETED) {
      throw new BadRequestException('Order is already completed');
    }

    if (order.paymentStatus === PaymentStatusEnum.PENDING) {
      throw new BadRequestException('Order requires at least a partial payment before sample collection');
    }

    order.status = OrderStatusEnum.COLLECTED;
    order.collectedAt = new Date();
    order.collectedBy = userId ? new Types.ObjectId(userId) : undefined;

    await order.save();

    this.logger.log(`Samples collected for order: ${order.orderNumber}`);

    const populatedOrder = await this.findOne(id, branchId);

    // Emit real-time event
    this.realtimeGateway.notifyOrderStatusChanged(
      order._id.toString(),
      order.status,
      order.orderNumber,
    );

    return populatedOrder;
  }

  /**
   * Get orders pending collection
   */
  async getPendingCollection(branchId?: string): Promise<Order[]> {
    const query: any = { status: OrderStatusEnum.PENDING_COLLECTION };
    if (branchId) {
      query.branchId = branchId;
    }

    const orders = await this.orderModel
      .find(query)
      .populate('patientId', 'patientId firstName lastName age gender')
      .populate('orderedBy', 'fullName email')
      .populate('doctorId', 'fullName phone facility')
      .sort({ createdAt: 1 })
      .exec();

    // Get order tests for each order
    const ordersWithTests = await Promise.all(
      orders.map(async (order) => {
        const tests = await this.orderTestModel
          .find({ orderId: order._id })
          .populate('testId', 'testCode testName')
          .exec();
        
        return {
          ...order.toObject(),
          order_tests: tests,
        };
      }),
    );

    return ordersWithTests as any;
  }

  /**
   * Get orders pending results
   */
  async getPendingResults(branchId?: string): Promise<Order[]> {
    const query: any = {
      status: {
        $in: [OrderStatusEnum.COLLECTED, OrderStatusEnum.PROCESSING],
      },
    };
    if (branchId) {
      query.branchId = branchId;
    }

    const orders = await this.orderModel
      .find(query)
      .populate('patientId', 'patientId firstName lastName age gender')
      .populate('orderedBy', 'fullName email')
      .populate('doctorId', 'fullName phone facility')
      .sort({ createdAt: 1 })
      .exec();

    // Get order tests for each order
    const ordersWithTests = await Promise.all(
      orders.map(async (order) => {
        const tests = await this.orderTestModel
          .find({ orderId: order._id })
          .populate('testId', 'testCode testName')
          .exec();
        
        return {
          ...order.toObject(),
          order_tests: tests,
        };
      }),
    );

    return ordersWithTests as any;
  }

  /**
   * Get payment statistics — aggregates from Payment collection for accurate split-payment reporting
   */
  async getPaymentStats(startDate?: string, endDate?: string, branchId?: string) {
    const orderQuery: any = {};
    const paymentQuery: any = {};

    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        dateFilter.$lte = endOfDay;
      }
      orderQuery.createdAt = dateFilter;
      paymentQuery.createdAt = dateFilter;
    }

    if (branchId) {
      orderQuery.branchId = branchId;
      paymentQuery.branchId = branchId;
    }

    const [totalOrders, paidOrders, pendingOrders, totalRevenue, collectedByMethod] =
      await Promise.all([
        this.orderModel.countDocuments(orderQuery),
        this.orderModel.countDocuments({
          ...orderQuery,
          paymentStatus: PaymentStatusEnum.PAID,
        }),
        this.orderModel.countDocuments({
          ...orderQuery,
          paymentStatus: PaymentStatusEnum.PENDING,
        }),
        this.orderModel.aggregate([
          { $match: orderQuery },
          { $group: { _id: null, total: { $sum: '$total' } } },
        ]),
        this.paymentModel.aggregate([
          { $match: paymentQuery },
          { $group: { _id: '$paymentMethod', total: { $sum: '$amount' } } },
        ]),
      ]);

    const methodTotals: Record<string, number> = { cash: 0, orange_money: 0, afrimoney: 0 };
    let paidRevenue = 0;
    for (const m of collectedByMethod) {
      if (m._id in methodTotals) methodTotals[m._id] = m.total;
      paidRevenue += m.total;
    }

    const totalRev = totalRevenue[0]?.total || 0;
    return {
      totalOrders,
      paidOrders,
      pendingOrders,
      totalRevenue: totalRev,
      paidRevenue,
      pendingRevenue: totalRev - paidRevenue,
      cashCollected: methodTotals.cash,
      orangeMoneyCollected: methodTotals.orange_money,
      afrimoneyCollected: methodTotals.afrimoney,
    };
  }

  /**
   * Get daily income breakdown — aggregates from Payment collection for accurate split-payment reporting
   */
  async getDailyIncome(startDate?: string, endDate?: string, branchId?: string) {
    const matchQuery: any = {};

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        matchQuery.createdAt.$lte = endOfDay;
      }
    }

    if (branchId) {
      matchQuery.branchId = branchId;
    }

    const dailyIncome = await this.paymentModel.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          date: { $first: '$createdAt' },
          totalIncome: { $sum: '$amount' },
          paymentCount: { $sum: 1 },
          cashPayments: {
            $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$amount', 0] },
          },
          orangeMoneyPayments: {
            $sum: { $cond: [{ $eq: ['$paymentMethod', 'orange_money'] }, '$amount', 0] },
          },
          afrimoneyPayments: {
            $sum: { $cond: [{ $eq: ['$paymentMethod', 'afrimoney'] }, '$amount', 0] },
          },
        },
      },
      { $sort: { date: -1 } },
    ]);

    return dailyIncome;
  }

  /**
   * Get outstanding balances — orders with pending or partial payment status
   */
  async getOutstandingBalances(branchId?: string) {
    const query: any = {
      paymentStatus: { $in: [PaymentStatusEnum.PENDING, PaymentStatusEnum.PARTIAL] },
      status: { $ne: OrderStatusEnum.CANCELLED },
    };
    if (branchId) {
      query.branchId = branchId;
    }

    const orders = await this.orderModel
      .find(query)
      .populate('patientId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const partialOrders = orders.filter((o) => o.paymentStatus === PaymentStatusEnum.PARTIAL);
    const pendingOrders = orders.filter((o) => o.paymentStatus === PaymentStatusEnum.PENDING);

    const partialBalance = partialOrders.reduce((sum, o) => sum + (o.balance || 0), 0);
    const pendingBalance = pendingOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    return {
      orders: orders.map((o) => ({
        _id: o._id,
        orderNumber: o.orderNumber,
        paymentStatus: o.paymentStatus,
        total: o.total,
        amountPaid: o.amountPaid,
        balance: o.balance,
        createdAt: o.createdAt,
        patientId: o.patientId,
      })),
      summary: {
        partialCount: partialOrders.length,
        pendingCount: pendingOrders.length,
        partialBalance,
        pendingBalance,
        totalOutstanding: partialBalance + pendingBalance,
      },
    };
  }

  /**
   * Add a payment to an order — supports partial / credit payments
   */
  async addPayment(
    id: string,
    addPaymentDto: AddPaymentDto,
    userId?: string,
    branchId?: string,
  ): Promise<{ order: Order; payment: any }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const filter: any = { _id: id };
    if (branchId) {
      filter.branchId = branchId;
    }

    const order = await this.orderModel.findOne(filter).exec();
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    if (order.status === OrderStatusEnum.CANCELLED) {
      throw new BadRequestException('Cannot add payment to a cancelled order');
    }

    if (order.paymentStatus === PaymentStatusEnum.PAID) {
      throw new BadRequestException('Order is already fully paid');
    }

    const remaining = Math.round((order.total - order.amountPaid) * 100) / 100;
    if (addPaymentDto.amount > remaining + 0.001) {
      throw new BadRequestException(
        `Payment amount (${addPaymentDto.amount}) exceeds remaining balance (${remaining})`,
      );
    }

    // Wallet payment: deduct from patient's wallet first
    if (addPaymentDto.paymentMethod === 'wallet') {
      const PatientModel = this.orderModel.db.model<Patient>('Patient');
      const WalletTxModel = this.orderModel.db.model<WalletTransaction>('WalletTransaction');
      const patient = await PatientModel.findById(order.patientId).exec();
      if (!patient) {
        throw new BadRequestException('Patient not found for wallet deduction');
      }
      const balanceBefore = patient.walletBalance || 0;
      if (addPaymentDto.amount > balanceBefore) {
        throw new BadRequestException(
          `Insufficient wallet balance. Available: Le ${balanceBefore.toLocaleString()}`,
        );
      }
      patient.walletBalance = balanceBefore - addPaymentDto.amount;
      patient.walletLastUpdated = new Date();
      await patient.save();
      await WalletTxModel.create({
        patientId: order.patientId,
        type: WalletTransactionTypeEnum.PAYMENT,
        amount: addPaymentDto.amount,
        balanceBefore,
        balanceAfter: patient.walletBalance,
        reference: `Payment for order ${order.orderNumber}`,
        notes: addPaymentDto.notes,
        performedBy: userId ? new Types.ObjectId(userId) : undefined,
        orderId: order._id,
      });
      this.realtimeGateway.emitToAll('wallet:updated', {
        patientId: order.patientId.toString(),
        balance: patient.walletBalance,
        type: 'payment',
        amount: addPaymentDto.amount,
      });
    }

    // Create payment record
    const payment = await this.paymentModel.create({
      orderId: order._id,
      paymentType: this.getPaymentTypeForOrder(order.orderType),
      amount: addPaymentDto.amount,
      paymentMethod: addPaymentDto.paymentMethod,
      receivedBy: userId ? new Types.ObjectId(userId) : undefined,
      notes: addPaymentDto.notes,
    });

    // Update order totals
    order.amountPaid = Math.round((order.amountPaid + addPaymentDto.amount) * 100) / 100;
    order.balance = Math.round((order.total - order.amountPaid) * 100) / 100;

    if (order.amountPaid >= order.total) {
      order.paymentStatus = PaymentStatusEnum.PAID;
      order.balance = 0;
    } else {
      order.paymentStatus = PaymentStatusEnum.PARTIAL;
    }

    if (order.paymentStatus === PaymentStatusEnum.PAID && order.status === OrderStatusEnum.AWAITING_PAYMENT) {
      order.status = this.getPaidStatusForOrder(order.orderType);
    }

    await order.save();
    this.logger.log(
      `Payment of ${addPaymentDto.amount} added to ${order.orderNumber} via ${addPaymentDto.paymentMethod}. Balance: ${order.balance}`,
    );

    const populatedOrder = await this.findOne(id, branchId);
    this.realtimeGateway.notifyOrderUpdated(populatedOrder);
    if (order.visitId) {
      await this.syncVisitStatus(order.visitId as Types.ObjectId);
    }

    if (order.orderType === OrderTypeEnum.LAB) {
      void this.lisIntegrationService.syncPaymentToLis(
        order._id.toString(),
        addPaymentDto.amount,
        addPaymentDto.paymentMethod,
      );
    }

    return { order: populatedOrder, payment };
  }

  /**
   * Get full payment history for an order
   */
  async getPaymentHistory(orderId: string): Promise<any[]> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    return this.paymentModel
      .find({ orderId: new Types.ObjectId(orderId) })
      .populate('receivedBy', 'fullName email')
      .sort({ createdAt: 1 })
      .exec();
  }

  async remove(id: string, branchId?: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }
    const filter: any = { _id: id };
    if (branchId) {
      filter.branchId = branchId;
    }
    const order = await this.orderModel.findOne(filter).exec();
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }
    // Delete associated order tests and payments
    await this.orderTestModel.deleteMany({ orderId: new Types.ObjectId(id) }).exec();
    await this.paymentModel.deleteMany({ orderId: new Types.ObjectId(id) }).exec();
    await this.orderModel.findByIdAndDelete(id).exec();
    this.logger.log(`Order ${id} and its associated tests/payments deleted`);
  }

  async assignDoctor(
    id: string,
    assignDoctorDto: AssignDoctorDto,
    branchId?: string,
  ): Promise<Order> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const filter: any = { _id: id };
    if (branchId) {
      filter.branchId = branchId;
    }

    const order = await this.orderModel.findOne(filter).exec();
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const doctorName = assignDoctorDto.referredByDoctor?.trim();

    if (assignDoctorDto.doctorId) {
      if (!Types.ObjectId.isValid(assignDoctorDto.doctorId)) {
        throw new BadRequestException('Invalid doctor ID');
      }
      const doctor = await this.doctorModel.findById(assignDoctorDto.doctorId).lean();
      if (!doctor) throw new BadRequestException('Doctor not found');
      order.doctorId = new Types.ObjectId(assignDoctorDto.doctorId);
      order.referredByDoctor = doctor.fullName;
    } else if (doctorName) {
      order.referredByDoctor = doctorName;
      order.doctorId = undefined;
    } else {
      order.referredByDoctor = undefined;
      order.doctorId = undefined;
    }

    await order.save();
    const populatedOrder = await this.findOne(id, branchId);
    this.realtimeGateway.notifyOrderUpdated(populatedOrder);
    return populatedOrder;
  }

  /**
   * Get orders by type and status
   * Used by Lab dashboard (paid lab orders) and Pharmacy dashboard (paid pharmacy orders)
   */
  async findByTypeAndStatus(
    orderType: OrderTypeEnum,
    status?: OrderStatusEnum | OrderStatusEnum[],
    page: number = 1,
    limit: number = 50,
    branchId?: string,
  ): Promise<{ data: Order[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const query: any = { orderType };

    if (status) {
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else {
        query.status = status;
      }
    }

    if (branchId) {
      query.branchId = branchId;
    }

    const [data, total] = await Promise.all([
      this.orderModel
        .find(query)
        .populate('patientId', 'patientId firstName lastName age gender phone')
        .populate('doctorId', 'fullName phone facility')
        .populate('orderedBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.orderModel.countDocuments(query).exec(),
    ]);

    const dataWithTests = await Promise.all(
      data.map(async (order) => {
        const tests = await this.orderTestModel.find({ orderId: order._id }).lean().exec();
        return { ...order, order_tests: tests };
      }),
    );

    return { data: dataWithTests as unknown as Order[], total, page, limit };
  }

  /**
   * Get pending clinical orders (awaiting payment)
   * Used by Reception dashboard to show what needs to be paid
   * Covers both lab orders and pharmacy orders
   */
  async getPendingClinicalOrders(orderType?: OrderTypeEnum, branchId?: string): Promise<Order[]> {
    const query: any = { status: OrderStatusEnum.AWAITING_PAYMENT };
    if (orderType) {
      query.orderType = orderType;
    } else {
      // By default only show lab and pharmacy orders (not consultation orders)
      query.orderType = { $in: [OrderTypeEnum.LAB, OrderTypeEnum.PHARMACY] };
    }

    if (branchId) {
      query.branchId = branchId;
    }

    const orders = await this.orderModel
      .find(query)
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('doctorId', 'fullName')
      .populate('orderedBy', 'fullName')
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    // Attach order_tests so reception can see test names (FBC, CRP, etc.)
    return Promise.all(
      orders.map(async (order) => {
        const tests = await this.orderTestModel
          .find({ orderId: order._id })
          .lean()
          .exec();
        return { ...order, order_tests: tests };
      }),
    ) as any;
  }

  /**
   * Mark order as paid
   * Used by Reception when confirming payment
   */
  async markAsPaid(id: string, paymentMethod: string, userId?: string, branchId?: string): Promise<Order> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const filter: any = { _id: id };
    if (branchId) {
      filter.branchId = branchId;
    }

    const order = await this.orderModel.findOne(filter).exec();
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    if (order.status !== OrderStatusEnum.AWAITING_PAYMENT) {
      throw new BadRequestException('Order is not awaiting payment');
    }

    if (paymentMethod === PaymentMethodEnum.WALLET) {
      const result = await this.addPayment(
        id,
        {
          amount: order.total,
          paymentMethod: PaymentMethodEnum.WALLET,
          notes: `Wallet payment for ${order.orderType} order ${order.orderNumber}`,
        },
        userId,
        branchId,
      );
      return result.order;
    }

    order.status = this.getPaidStatusForOrder(order.orderType);

    order.paymentStatus = PaymentStatusEnum.PAID;
    order.amountPaid = order.total;
    order.balance = 0;
    order.paymentMethod = paymentMethod as any;

    await order.save();

    // Create payment record
    await this.paymentModel.create({
      orderId: order._id,
      paymentType: this.getPaymentTypeForOrder(order.orderType),
      amount: order.total,
      paymentMethod,
      receivedBy: userId ? new Types.ObjectId(userId) : undefined,
      notes: `Payment for ${order.orderType} order ${order.orderNumber}`,
    });

    this.logger.log(`Order ${order.orderNumber} marked as paid`);

    // Sync visit status if this order belongs to a visit
    if (order.visitId) {
      await this.syncVisitStatus(order.visitId as Types.ObjectId);
    }

    const populatedOrder = await this.findOne(id, branchId);
    this.realtimeGateway.notifyOrderUpdated(populatedOrder);

    if (order.orderType === OrderTypeEnum.LAB) {
      void this.lisIntegrationService.syncPaymentToLis(
        order._id.toString(),
        order.total,
        paymentMethod,
      );
    }

    return populatedOrder;
  }

  async syncToLis(id: string): Promise<Order> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    await this.lisIntegrationService.syncOrderToLis(id);
    return this.findOne(id);
  }

  async syncLisPayment(id: string): Promise<Order> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const order = await this.orderModel.findById(id).exec();
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    if (order.orderType !== OrderTypeEnum.LAB) {
      throw new BadRequestException('LIS payment sync is only supported for lab orders');
    }

    if (order.paymentStatus !== PaymentStatusEnum.PAID) {
      throw new BadRequestException('Only fully paid lab orders can be synced to LIS payment state');
    }

    const paymentMethod = order.paymentMethod || PaymentMethodEnum.CASH;
    await this.lisIntegrationService.syncPaymentToLis(
      order._id.toString(),
      order.amountPaid || order.total,
      paymentMethod,
    );

    return this.findOne(id);
  }

  async fetchLisResults(id: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return this.lisIntegrationService.fetchAndStoreResults(id);
  }

  async getLisCatalog(): Promise<Array<{
    _id: string;
    code: string;
    name: string;
    price: number;
    isPanel: boolean;
    category: string;
    panelComponents?: Array<{ testCode: string; testName: string }>;
  }>> {
    const items = await this.lisIntegrationService.fetchLisOrderables();
    return items.map((item) => ({
      _id: item.code,
      code: item.code,
      name: item.name,
      price: Number(item.price || 0),
      isPanel: Boolean(item.isPanel),
      category: item.category || 'lab',
      panelComponents: item.panelComponents || [],
    }));
  }

  /**
   * Sync visit status based on all orders for that visit
   */
  private async syncVisitStatus(visitId: Types.ObjectId): Promise<void> {
    const orders = await this.orderModel.find({ visitId }).lean();
    if (orders.length === 0) return;

    const visit = await this.visitModel.findById(visitId);
    if (!visit) return;
    if ([VisitStatusEnum.COMPLETED, VisitStatusEnum.CANCELLED].includes(visit.status)) return;

    const hasUnpaidLab = orders.some(o => o.orderType === OrderTypeEnum.LAB && o.paymentStatus !== PaymentStatusEnum.PAID);
    const hasUnpaidPharmacy = orders.some(o => o.orderType === OrderTypeEnum.PHARMACY && o.paymentStatus !== PaymentStatusEnum.PAID);
    const hasPendingLab = orders.some(o => o.orderType === OrderTypeEnum.LAB && o.status === OrderStatusEnum.PENDING_COLLECTION);
    const hasProcessingLab = orders.some(o => o.orderType === OrderTypeEnum.LAB && o.status === OrderStatusEnum.PROCESSING);
    const hasCompletedLab = orders.some(o => o.orderType === OrderTypeEnum.LAB && o.status === OrderStatusEnum.COMPLETED);
    const hasPendingPharmacy = orders.some(o => o.orderType === OrderTypeEnum.PHARMACY && o.status === OrderStatusEnum.PAID);
    const hasCompletedPharmacy = orders.some(o => o.orderType === OrderTypeEnum.PHARMACY && o.status === OrderStatusEnum.COMPLETED);
    const allOrdersCompleted = orders.every(o => o.status === OrderStatusEnum.COMPLETED || o.status === OrderStatusEnum.CANCELLED);

    let newStatus: VisitStatusEnum | null = null;

    if (allOrdersCompleted && orders.length > 0) {
      newStatus = hasCompletedLab ? VisitStatusEnum.RESULTS_READY : VisitStatusEnum.AWAITING_DOCTOR_REVIEW;
    } else if (hasUnpaidLab) {
      newStatus = VisitStatusEnum.AWAITING_LAB;
    } else if (hasUnpaidPharmacy) {
      newStatus = VisitStatusEnum.AWAITING_PHARMACY;
    } else if (hasPendingLab || hasProcessingLab) {
      newStatus = VisitStatusEnum.AWAITING_RESULTS;
    } else if (hasCompletedLab && hasPendingPharmacy) {
      newStatus = VisitStatusEnum.AWAITING_DISPENSING;
    } else if (hasCompletedLab && hasCompletedPharmacy) {
      newStatus = VisitStatusEnum.RESULTS_READY;
    } else if (hasCompletedLab) {
      newStatus = VisitStatusEnum.RESULTS_READY;
    } else if (hasPendingPharmacy) {
      newStatus = VisitStatusEnum.AWAITING_DISPENSING;
    }

    if (newStatus && newStatus !== visit.status) {
      this.logger.log(`Visit ${visit.visitNumber} status synced: ${visit.status} → ${newStatus}`);
      visit.status = newStatus;
      await visit.save();
      this.realtimeGateway.emitToAll('visit:status_updated', { visitId: visit._id, status: newStatus });
    }
  }

  /**
   * Get lab orders for lab dashboard
   * Returns orders that are paid and ready for processing
   */
  async getLabQueue(branchId?: string): Promise<Order[]> {
    const query: any = {
      orderType: OrderTypeEnum.LAB,
      status: { $in: [OrderStatusEnum.PENDING_COLLECTION, OrderStatusEnum.COLLECTED, OrderStatusEnum.PROCESSING] },
    };
    if (branchId) {
      query.branchId = branchId;
    }

    const orders = await this.orderModel
      .find(query)
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('doctorId', 'fullName')
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    return Promise.all(
      orders.map(async (order) => {
        const tests = await this.orderTestModel
          .find({ orderId: order._id })
          .lean()
          .exec();
        return { ...order, order_tests: tests };
      }),
    ) as any;
  }

  async getPharmacyQueue(branchId?: string): Promise<Order[]> {
    const query: any = {
      orderType: OrderTypeEnum.PHARMACY,
      status: OrderStatusEnum.PAID,
    };
    if (branchId) {
      query.branchId = branchId;
    }

    const orders = await this.orderModel
      .find(query)
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('doctorId', 'fullName')
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    return Promise.all(
      orders.map(async (order) => {
        const tests = await this.orderTestModel
          .find({ orderId: order._id })
          .lean()
          .exec();
        return { ...order, order_tests: tests };
      }),
    ) as any;
  }
}
