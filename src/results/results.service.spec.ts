import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResultsService } from './results.service';
import { Result, ResultFlagEnum, ResultStatusEnum } from '../database/schemas/result.schema';
import { Types } from 'mongoose';

describe('ResultsService', () => {
  let service: ResultsService;
  let mockResultModel: any;

  beforeEach(async () => {
    mockResultModel = function (data: any) {
      return {
        ...data,
        save: jest.fn().mockResolvedValue(data),
      };
    };

    mockResultModel.find = jest.fn();
    mockResultModel.findById = jest.fn();
    mockResultModel.findByIdAndDelete = jest.fn();
    mockResultModel.countDocuments = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResultsService,
        {
          provide: getModelToken(Result.name),
          useValue: mockResultModel,
        },
      ],
    }).compile();

    service = module.get<ResultsService>(ResultsService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateFlag', () => {
    it('should return NORMAL for value within range', () => {
      const flag = service.calculateFlag('14', '12-16');
      expect(flag).toBe(ResultFlagEnum.NORMAL);
    });

    it('should return LOW for value below range', () => {
      const flag = service.calculateFlag('11', '12-16');
      expect(flag).toBe(ResultFlagEnum.LOW);
    });

    it('should return HIGH for value above range', () => {
      const flag = service.calculateFlag('17', '12-16');
      expect(flag).toBe(ResultFlagEnum.HIGH);
    });

    it('should return CRITICAL_LOW for value significantly below range', () => {
      const flag = service.calculateFlag('8', '12-16');
      expect(flag).toBe(ResultFlagEnum.CRITICAL_LOW);
    });

    it('should return CRITICAL_HIGH for value significantly above range', () => {
      const flag = service.calculateFlag('20', '12-16');
      expect(flag).toBe(ResultFlagEnum.CRITICAL_HIGH);
    });

    it('should handle range with spaces', () => {
      const flag = service.calculateFlag('14', '12.5 - 16.5');
      expect(flag).toBe(ResultFlagEnum.NORMAL);
    });

    it('should handle "< X" format', () => {
      const flag = service.calculateFlag('3', '< 5.0');
      expect(flag).toBe(ResultFlagEnum.NORMAL);
    });

    it('should return HIGH for value >= threshold in "< X" format', () => {
      const flag = service.calculateFlag('6', '< 5.0');
      expect(flag).toBe(ResultFlagEnum.HIGH);
    });

    it('should handle "> X" format', () => {
      const flag = service.calculateFlag('150', '> 100');
      expect(flag).toBe(ResultFlagEnum.NORMAL);
    });

    it('should return LOW for value <= threshold in "> X" format', () => {
      const flag = service.calculateFlag('90', '> 100');
      expect(flag).toBe(ResultFlagEnum.LOW);
    });

    it('should return NORMAL for non-numeric value', () => {
      const flag = service.calculateFlag('Positive', '12-16');
      expect(flag).toBe(ResultFlagEnum.NORMAL);
    });

    it('should return NORMAL when no reference range provided', () => {
      const flag = service.calculateFlag('14');
      expect(flag).toBe(ResultFlagEnum.NORMAL);
    });

    it('should return NORMAL for unparseable reference range', () => {
      const flag = service.calculateFlag('14', 'Normal');
      expect(flag).toBe(ResultFlagEnum.NORMAL);
    });
  });

  describe('create', () => {
    it('should create a result with calculated flag', async () => {
      const userId = new Types.ObjectId().toString();
      const createDto = {
        orderId: new Types.ObjectId().toString(),
        testCode: 'HGB',
        testName: 'Hemoglobin',
        value: '14',
        unit: 'g/dL',
        referenceRange: '12-16',
      };

      const result = await service.create(createDto, userId);

      expect(result).toBeDefined();
      expect(result.testCode).toBe('HGB');
      expect(result.flag).toBe(ResultFlagEnum.NORMAL);
    });

    it('should use provided flag if given', async () => {
      const userId = new Types.ObjectId().toString();
      const createDto = {
        orderId: new Types.ObjectId().toString(),
        testCode: 'HGB',
        testName: 'Hemoglobin',
        value: '14',
        unit: 'g/dL',
        referenceRange: '12-16',
        flag: ResultFlagEnum.HIGH,
      };

      const result = await service.create(createDto, userId);

      expect(result.flag).toBe(ResultFlagEnum.HIGH);
    });
  });

  describe('findOne', () => {
    it('should throw BadRequestException for invalid ID', async () => {
      await expect(service.findOne('invalid-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when result not found', async () => {
      const validId = new Types.ObjectId().toString();

      mockResultModel.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.findOne(validId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return result when found', async () => {
      const validId = new Types.ObjectId().toString();
      const mockResult = {
        _id: validId,
        testCode: 'HGB',
        value: '14',
      };

      mockResultModel.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockResult),
      });

      const result = await service.findOne(validId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('verify', () => {
    it('should throw BadRequestException for invalid ID', async () => {
      await expect(service.verify('invalid-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when result not found', async () => {
      const validId = new Types.ObjectId().toString();

      mockResultModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.verify(validId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if already verified', async () => {
      const validId = new Types.ObjectId().toString();
      const mockResult = {
        _id: validId,
        status: ResultStatusEnum.VERIFIED,
      };

      mockResultModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockResult),
      });

      await expect(service.verify(validId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should verify result successfully', async () => {
      const validId = new Types.ObjectId().toString();
      const userId = new Types.ObjectId().toString();
      const mockResult = {
        _id: validId,
        status: ResultStatusEnum.PRELIMINARY,
        save: jest.fn().mockResolvedValue({
          status: ResultStatusEnum.VERIFIED,
          verifiedAt: expect.any(Date),
          verifiedBy: expect.any(Types.ObjectId),
        }),
      };

      mockResultModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockResult),
      });

      const result = await service.verify(validId, userId);

      expect(mockResult.status).toBe(ResultStatusEnum.VERIFIED);
      expect(mockResult.save).toHaveBeenCalled();
    });
  });

  describe('amend', () => {
    it('should throw BadRequestException for invalid ID', async () => {
      const amendDto = { newValue: '15', reason: 'Correction' };
      await expect(service.amend('invalid-id', amendDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when result not found', async () => {
      const validId = new Types.ObjectId().toString();
      const amendDto = { newValue: '15', reason: 'Correction' };

      mockResultModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.amend(validId, amendDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should create amended result with new value', async () => {
      const validId = new Types.ObjectId().toString();
      const userId = new Types.ObjectId().toString();
      const amendDto = { newValue: '15', reason: 'Correction' };
      const originalResult = {
        _id: validId,
        orderId: new Types.ObjectId(),
        testCode: 'HGB',
        testName: 'Hemoglobin',
        value: '14',
        unit: 'g/dL',
        referenceRange: '12-16',
      };

      mockResultModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(originalResult),
      });

      const result = await service.amend(validId, amendDto, userId);

      expect(result).toBeDefined();
      expect(result.value).toBe('15');
      expect(result.amendmentReason).toBe('Correction');
    });
  });

  describe('findPendingVerification', () => {
    it('should return results with preliminary status', async () => {
      const mockResults = [
        { _id: '1', status: ResultStatusEnum.PRELIMINARY },
        { _id: '2', status: ResultStatusEnum.PRELIMINARY },
      ];

      mockResultModel.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockResults),
      });

      mockResultModel.countDocuments = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(2),
      });

      const result = await service.findPendingVerification(1, 10);

      expect(result.results).toEqual(mockResults);
      expect(result.total).toBe(2);
    });
  });

  describe('findCritical', () => {
    it('should return results with critical flags', async () => {
      const mockResults = [
        { _id: '1', flag: ResultFlagEnum.CRITICAL_HIGH },
        { _id: '2', flag: ResultFlagEnum.CRITICAL_LOW },
      ];

      mockResultModel.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockResults),
      });

      mockResultModel.countDocuments = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(2),
      });

      const result = await service.findCritical(1, 10);

      expect(result.results).toEqual(mockResults);
      expect(result.total).toBe(2);
    });
  });

  describe('update', () => {
    it('should throw BadRequestException for invalid ID', async () => {
      const updateDto = { value: '15' };
      await expect(service.update('invalid-id', updateDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when result not found', async () => {
      const validId = new Types.ObjectId().toString();
      const updateDto = { value: '15' };

      mockResultModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.update(validId, updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should recalculate flag when value changes', async () => {
      const validId = new Types.ObjectId().toString();
      const updateDto = { value: '18' };
      const mockResult = {
        _id: validId,
        value: '14',
        referenceRange: '12-16',
        save: jest.fn().mockResolvedValue({
          value: '18',
          flag: ResultFlagEnum.HIGH,
        }),
      };

      mockResultModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockResult),
      });

      await service.update(validId, updateDto);

      expect(mockResult.save).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should throw BadRequestException for invalid ID', async () => {
      await expect(service.remove('invalid-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when result not found', async () => {
      const validId = new Types.ObjectId().toString();

      mockResultModel.findByIdAndDelete = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.remove(validId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete result successfully', async () => {
      const validId = new Types.ObjectId().toString();
      const mockResult = { _id: validId };

      mockResultModel.findByIdAndDelete = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockResult),
      });

      await service.remove(validId);

      expect(mockResultModel.findByIdAndDelete).toHaveBeenCalledWith(validId);
    });
  });
});
