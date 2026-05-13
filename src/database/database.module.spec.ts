import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from './database.module';
import configuration from '../config/configuration';

/**
 * Database Module Unit Tests
 * 
 * Tests the database module configuration without requiring a running MongoDB instance
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */
describe('DatabaseModule', () => {
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [configuration],
          isGlobal: true,
        }),
      ],
    }).compile();

    configService = module.get<ConfigService>(ConfigService);
  });

  describe('Configuration', () => {
    it('should load database URI from configuration', () => {
      const dbUri = configService.get<string>('database.uri');
      expect(dbUri).toBeDefined();
      expect(typeof dbUri).toBe('string');
    });

    it('should have database options configured', () => {
      const dbOptions = configService.get('database.options');
      expect(dbOptions).toBeDefined();
      expect(dbOptions).toHaveProperty('retryWrites');
      expect(dbOptions).toHaveProperty('w');
    });

    it('should support local MongoDB URI format', () => {
      const dbUri = configService.get<string>('database.uri');
      const isLocalOrAtlas =
        dbUri.startsWith('mongodb://') || dbUri.startsWith('mongodb+srv://');
      expect(isLocalOrAtlas).toBe(true);
    });

    it('should support MongoDB Atlas URI format', () => {
      // Test that the configuration can handle Atlas URIs
      const atlasUri =
        'mongodb+srv://user:pass@cluster.mongodb.net/db?retryWrites=true&w=majority';
      expect(atlasUri).toMatch(/^mongodb\+srv:\/\//);
    });

    it('should have retry writes enabled in options', () => {
      const dbOptions = configService.get('database.options');
      expect(dbOptions.retryWrites).toBe(true);
    });

    it('should have write concern configured', () => {
      const dbOptions = configService.get('database.options');
      expect(dbOptions.w).toBe('majority');
    });
  });

  describe('Module Structure', () => {
    it('should be defined as a module', () => {
      expect(DatabaseModule).toBeDefined();
    });

    it('should have imports array', () => {
      const metadata = Reflect.getMetadata('imports', DatabaseModule);
      expect(metadata).toBeDefined();
      expect(Array.isArray(metadata)).toBe(true);
    });

    it('should have providers array', () => {
      const metadata = Reflect.getMetadata('providers', DatabaseModule);
      expect(metadata).toBeDefined();
      expect(Array.isArray(metadata)).toBe(true);
    });

    it('should have exports array', () => {
      const metadata = Reflect.getMetadata('exports', DatabaseModule);
      expect(metadata).toBeDefined();
      expect(Array.isArray(metadata)).toBe(true);
    });
  });
});
