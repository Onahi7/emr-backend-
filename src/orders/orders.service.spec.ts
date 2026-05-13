import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { OrdersService } from './orders.service';
import { Order } from '../database/schemas/order.schema';
import { OrderTest } from '../database/schemas/order-test.schema';
import { IdSequence } from '../database/schemas/id-sequence.schema';

describe('OrdersService', () => {
  let service: OrdersService;

  const mockOrderModel = {
    new: jest.fn(),
    constructor: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    exec: jest.fn(),
  };

  const mockOrderTestModel = {
    find: jest.fn(),
    insertMany: jest.fn(),
    exec: jest.fn(),
  };

  const mockIdSequenceModel = {
    findByIdAndUpdate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: getModelToken(Order.name),
          useValue: mockOrderModel,
        },
        {
          provide: getModelToken(OrderTest.name),
          useValue: mockOrderTestModel,
        },
        {
          provide: getModelToken(IdSequence.name),
          useValue: mockIdSequenceModel,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateTotal', () => {
    it('should calculate total with percentage discount', () => {
      const subtotal = 10000;
      const discount = 10;
      const discountType = 'percentage';
      
      // Access private method through any type
      const total = (service as any).calculateTotal(subtotal, discount, discountType);
      
      expect(total).toBe(9000);
    });

    it('should calculate total with fixed discount', () => {
      const subtotal = 10000;
      const discount = 1000;
      const discountType = 'fixed';
      
      const total = (service as any).calculateTotal(subtotal, discount, discountType);
      
      expect(total).toBe(9000);
    });

    it('should return subtotal when no discount', () => {
      const subtotal = 10000;
      
      const total = (service as any).calculateTotal(subtotal, 0);
      
      expect(total).toBe(10000);
    });

    it('should throw error for negative discount', () => {
      const subtotal = 10000;
      const discount = -100;
      
      expect(() => {
        (service as any).calculateTotal(subtotal, discount, 'fixed');
      }).toThrow('Discount cannot be negative');
    });

    it('should throw error for percentage discount > 100', () => {
      const subtotal = 10000;
      const discount = 150;
      
      expect(() => {
        (service as any).calculateTotal(subtotal, discount, 'percentage');
      }).toThrow('Percentage discount cannot exceed 100%');
    });

    it('should throw error for fixed discount > subtotal', () => {
      const subtotal = 10000;
      const discount = 15000;
      
      expect(() => {
        (service as any).calculateTotal(subtotal, discount, 'fixed');
      }).toThrow('Fixed discount cannot exceed subtotal');
    });
  });
});
