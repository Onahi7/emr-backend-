import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ReportsService } from './reports.service';
import { Order } from '../database/schemas/order.schema';
import { Result } from '../database/schemas/result.schema';
import { Machine } from '../database/schemas/machine.schema';
import { Sample } from '../database/schemas/sample.schema';
import { Patient, GenderEnum } from '../database/schemas/patient.schema';
import { TestCatalog, TestCategoryEnum } from '../database/schemas/test-catalog.schema';
import { Profile } from '../database/schemas/profile.schema';
import { ResultFlagEnum } from '../database/schemas/result.schema';
import { ResultItemDto } from './dto/result-item.dto';

describe('ReportsService - Helper Functions', () => {
  let service: ReportsService;

  // Mock models
  const mockModel = {
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getModelToken(Order.name), useValue: mockModel },
        { provide: getModelToken(Result.name), useValue: mockModel },
        { provide: getModelToken(Machine.name), useValue: mockModel },
        { provide: getModelToken(Sample.name), useValue: mockModel },
        { provide: getModelToken(Patient.name), useValue: mockModel },
        { provide: getModelToken(TestCatalog.name), useValue: mockModel },
        { provide: getModelToken(Profile.name), useValue: mockModel },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('calculateAge', () => {
    it('should calculate age correctly for a date of birth', () => {
      const today = new Date();
      const birthDate = new Date(today.getFullYear() - 30, today.getMonth(), today.getDate());
      
      const age = service.calculateAge(birthDate);
      
      expect(age).toBe(30);
    });

    it('should calculate age correctly when birthday has not occurred this year', () => {
      const today = new Date();
      const birthDate = new Date(
        today.getFullYear() - 30,
        today.getMonth() + 1, // Next month
        today.getDate()
      );
      
      const age = service.calculateAge(birthDate);
      
      expect(age).toBe(29);
    });

    it('should calculate age correctly for leap year birthdays', () => {
      const birthDate = new Date(2000, 1, 29); // Feb 29, 2000
      const age = service.calculateAge(birthDate);
      
      const today = new Date();
      const expectedAge = today.getFullYear() - 2000;
      const monthDiff = today.getMonth() - 1; // February is month 1
      const adjustedExpectedAge = 
        (monthDiff < 0 || (monthDiff === 0 && today.getDate() < 29))
          ? expectedAge - 1
          : expectedAge;
      
      expect(age).toBe(adjustedExpectedAge);
    });

    it('should return 0 for someone born today', () => {
      const today = new Date();
      const age = service.calculateAge(today);
      
      expect(age).toBe(0);
    });
  });

  describe('selectReferenceRange', () => {
    it('should return the reference range when provided', () => {
      const range = service.selectReferenceRange(
        'TEST001',
        GenderEnum.MALE,
        30,
        '10-20 mg/dL'
      );
      
      expect(range).toBe('10-20 mg/dL');
    });

    it('should return undefined when no reference range is provided', () => {
      const range = service.selectReferenceRange(
        'TEST001',
        GenderEnum.FEMALE,
        25,
        undefined
      );
      
      expect(range).toBeUndefined();
    });
  });

  describe('formatCategoryDisplayName', () => {
    it('should format chemistry category correctly', () => {
      const displayName = service.formatCategoryDisplayName(TestCategoryEnum.CHEMISTRY);
      expect(displayName).toBe('Clinical Chemistry / Electrolytes');
    });

    it('should format hematology category correctly', () => {
      const displayName = service.formatCategoryDisplayName(TestCategoryEnum.HEMATOLOGY);
      expect(displayName).toBe('Hematology');
    });

    it('should format immunoassay category correctly', () => {
      const displayName = service.formatCategoryDisplayName(TestCategoryEnum.IMMUNOASSAY);
      expect(displayName).toBe('Immunoassay');
    });

    it('should format urinalysis category correctly', () => {
      const displayName = service.formatCategoryDisplayName(TestCategoryEnum.URINALYSIS);
      expect(displayName).toBe('Urinalysis');
    });

    it('should format microbiology category correctly', () => {
      const displayName = service.formatCategoryDisplayName(TestCategoryEnum.MICROBIOLOGY);
      expect(displayName).toBe('Microbiology');
    });

    it('should format other category correctly', () => {
      const displayName = service.formatCategoryDisplayName(TestCategoryEnum.OTHER);
      expect(displayName).toBe('Other Tests');
    });
  });

  describe('groupResultsByCategory', () => {
    it('should group results by category correctly', () => {
      const results: ResultItemDto[] = [
        {
          testCode: 'CBC',
          testName: 'Complete Blood Count',
          value: '5.0',
          unit: 'x10^9/L',
          referenceRange: '4.0-10.0',
          flag: ResultFlagEnum.NORMAL,
          resultedAt: new Date(),
          isAmended: false,
          category: TestCategoryEnum.HEMATOLOGY,
        } as any,
        {
          testCode: 'GLU',
          testName: 'Glucose',
          value: '95',
          unit: 'mg/dL',
          referenceRange: '70-100',
          flag: ResultFlagEnum.NORMAL,
          resultedAt: new Date(),
          isAmended: false,
          category: TestCategoryEnum.CHEMISTRY,
        } as any,
        {
          testCode: 'HGB',
          testName: 'Hemoglobin',
          value: '14.5',
          unit: 'g/dL',
          referenceRange: '13.5-17.5',
          flag: ResultFlagEnum.NORMAL,
          resultedAt: new Date(),
          isAmended: false,
          category: TestCategoryEnum.HEMATOLOGY,
        } as any,
      ];

      const grouped = service.groupResultsByCategory(results);

      expect(grouped).toHaveLength(2);
      expect(grouped[0].category).toBe(TestCategoryEnum.CHEMISTRY);
      expect(grouped[0].results).toHaveLength(1);
      expect(grouped[1].category).toBe(TestCategoryEnum.HEMATOLOGY);
      expect(grouped[1].results).toHaveLength(2);
    });

    it('should maintain category order', () => {
      const results: ResultItemDto[] = [
        {
          testCode: 'MICRO1',
          testName: 'Culture',
          value: 'Negative',
          flag: ResultFlagEnum.NORMAL,
          resultedAt: new Date(),
          isAmended: false,
          category: TestCategoryEnum.MICROBIOLOGY,
        } as any,
        {
          testCode: 'CBC',
          testName: 'Complete Blood Count',
          value: '5.0',
          flag: ResultFlagEnum.NORMAL,
          resultedAt: new Date(),
          isAmended: false,
          category: TestCategoryEnum.HEMATOLOGY,
        } as any,
        {
          testCode: 'GLU',
          testName: 'Glucose',
          value: '95',
          flag: ResultFlagEnum.NORMAL,
          resultedAt: new Date(),
          isAmended: false,
          category: TestCategoryEnum.CHEMISTRY,
        } as any,
      ];

      const grouped = service.groupResultsByCategory(results);

      // Should be ordered: Chemistry, Hematology, Microbiology
      expect(grouped[0].category).toBe(TestCategoryEnum.CHEMISTRY);
      expect(grouped[1].category).toBe(TestCategoryEnum.HEMATOLOGY);
      expect(grouped[2].category).toBe(TestCategoryEnum.MICROBIOLOGY);
    });

    it('should handle empty results array', () => {
      const grouped = service.groupResultsByCategory([]);
      expect(grouped).toHaveLength(0);
    });

    it('should include category display names', () => {
      const results: ResultItemDto[] = [
        {
          testCode: 'GLU',
          testName: 'Glucose',
          value: '95',
          flag: ResultFlagEnum.NORMAL,
          resultedAt: new Date(),
          isAmended: false,
          category: TestCategoryEnum.CHEMISTRY,
        } as any,
      ];

      const grouped = service.groupResultsByCategory(results);

      expect(grouped[0].categoryDisplayName).toBe('Clinical Chemistry / Electrolytes');
    });
  });
});
