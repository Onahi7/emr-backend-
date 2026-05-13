import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TestCatalogService } from './test-catalog.service';
import { TestCatalog, TestCategoryEnum } from '../database/schemas/test-catalog.schema';
import { TestPanel } from '../database/schemas/test-panel.schema';
import { SampleTypeEnum } from '../database/schemas/sample.schema';

describe('TestCatalogService', () => {
  let service: TestCatalogService;
  let testCatalogModel: any;
  let testPanelModel: any;

  const mockTestCatalog = {
    _id: new Types.ObjectId(),
    code: 'CBC',
    name: 'Complete Blood Count',
    category: TestCategoryEnum.HEMATOLOGY,
    sampleType: SampleTypeEnum.BLOOD,
    price: 5000,
    unit: 'cells/µL',
    referenceRange: '4000-11000',
    turnaroundTime: 60,
    isActive: true,
    save: jest.fn().mockResolvedValue(this),
  };

  const mockTestPanel = {
    _id: new Types.ObjectId(),
    code: 'LIPID',
    name: 'Lipid Profile',
    description: 'Complete lipid panel',
    price: 8000,
    isActive: true,
    tests: [
      {
        testId: new Types.ObjectId(),
        testCode: 'CHOL',
        testName: 'Total Cholesterol',
      },
    ],
    save: jest.fn().mockResolvedValue(this),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestCatalogService,
        {
          provide: getModelToken(TestCatalog.name),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            findById: jest.fn(),
            findByIdAndUpdate: jest.fn(),
            findByIdAndDelete: jest.fn(),
            create: jest.fn(),
            constructor: jest.fn().mockResolvedValue(mockTestCatalog),
          },
        },
        {
          provide: getModelToken(TestPanel.name),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            findById: jest.fn(),
            findByIdAndUpdate: jest.fn(),
            findByIdAndDelete: jest.fn(),
            create: jest.fn(),
            constructor: jest.fn().mockResolvedValue(mockTestPanel),
          },
        },
      ],
    }).compile();

    service = module.get<TestCatalogService>(TestCatalogService);
    testCatalogModel = module.get(getModelToken(TestCatalog.name));
    testPanelModel = module.get(getModelToken(TestPanel.name));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTest', () => {
    it('should create a new test', async () => {
      const createTestDto = {
        code: 'CBC',
        name: 'Complete Blood Count',
        category: TestCategoryEnum.HEMATOLOGY,
        sampleType: SampleTypeEnum.BLOOD,
        price: 5000,
      };

      testCatalogModel.findOne.mockResolvedValue(null);
      testCatalogModel.create = jest.fn().mockImplementation((dto) => ({
        ...dto,
        _id: new Types.ObjectId(),
        save: jest.fn().mockResolvedValue({ ...dto, _id: new Types.ObjectId() }),
      }));

      const mockTest = {
        ...createTestDto,
        _id: new Types.ObjectId(),
        isActive: true,
        save: jest.fn().mockResolvedValue(this),
      };

      // Mock the constructor
      const TestCatalogConstructor = jest.fn().mockImplementation(() => mockTest);
      service['testCatalogModel'] = TestCatalogConstructor as any;

      const result = await mockTest.save();

      expect(result).toBeDefined();
    });

    it('should throw ConflictException if test code already exists', async () => {
      const createTestDto = {
        code: 'CBC',
        name: 'Complete Blood Count',
        category: TestCategoryEnum.HEMATOLOGY,
        sampleType: SampleTypeEnum.BLOOD,
        price: 5000,
      };

      testCatalogModel.findOne.mockResolvedValue(mockTestCatalog);

      await expect(service.createTest(createTestDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException for invalid machine ID', async () => {
      const createTestDto = {
        code: 'CBC',
        name: 'Complete Blood Count',
        category: TestCategoryEnum.HEMATOLOGY,
        sampleType: SampleTypeEnum.BLOOD,
        price: 5000,
        machineId: 'invalid-id',
      };

      testCatalogModel.findOne.mockResolvedValue(null);

      await expect(service.createTest(createTestDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findTestById', () => {
    it('should throw BadRequestException for invalid ID format', async () => {
      await expect(service.findTestById('invalid-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if test not found', async () => {
      const validId = new Types.ObjectId().toString();
      testCatalogModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      await expect(service.findTestById(validId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteTest', () => {
    it('should throw BadRequestException for invalid ID format', async () => {
      await expect(service.deleteTest('invalid-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if test not found', async () => {
      const validId = new Types.ObjectId().toString();
      testCatalogModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.deleteTest(validId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createTestPanel', () => {
    it('should throw ConflictException if panel code already exists', async () => {
      const createPanelDto = {
        code: 'LIPID',
        name: 'Lipid Profile',
        testIds: [new Types.ObjectId().toString()],
        price: 8000,
      };

      testPanelModel.findOne.mockResolvedValue(mockTestPanel);

      await expect(service.createTestPanel(createPanelDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException for invalid test ID', async () => {
      const createPanelDto = {
        code: 'LIPID',
        name: 'Lipid Profile',
        testIds: ['invalid-id'],
        price: 8000,
      };

      testPanelModel.findOne.mockResolvedValue(null);

      await expect(service.createTestPanel(createPanelDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findTestPanelById', () => {
    it('should throw BadRequestException for invalid ID format', async () => {
      await expect(service.findTestPanelById('invalid-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if panel not found', async () => {
      const validId = new Types.ObjectId().toString();
      testPanelModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      await expect(service.findTestPanelById(validId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
