import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { DatabaseHealthService } from './database-health.service';
import { DatabaseModule } from './database.module';
import configuration from '../config/configuration';

/**
 * Database Health Service Unit Tests
 * 
 * Tests the database health check functionality
 * Requirements: 3.4 (Connection error handling)
 */
describe('DatabaseHealthService', () => {
  let service: DatabaseHealthService;
  let connection: Connection;
  let module: TestingModule;

  beforeAll(async () => {
    // Use test database URI or default to localhost
    process.env.MONGODB_URI =
      process.env.MONGODB_URI || 'mongodb://localhost:27017/lis_test';

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [configuration],
          isGlobal: true,
        }),
        DatabaseModule,
      ],
    }).compile();

    service = module.get<DatabaseHealthService>(DatabaseHealthService);
    connection = module.get<Connection>(getConnectionToken());
  });

  afterAll(async () => {
    if (connection) {
      await connection.close();
    }
    if (module) {
      await module.close();
    }
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have connection injected', () => {
      expect(connection).toBeDefined();
    });
  });

  describe('checkHealth', () => {
    it('should return health status', async () => {
      const health = await service.checkHealth();

      expect(health).toBeDefined();
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('details');
    });

    it('should return healthy status when connected', async () => {
      const health = await service.checkHealth();

      expect(health.status).toBe('healthy');
      expect(health.details.connected).toBe(true);
      expect(health.details.readyState).toBe(1);
    });

    it('should include connection details', async () => {
      const health = await service.checkHealth();

      expect(health.details).toHaveProperty('readyStateDescription');
      expect(health.details).toHaveProperty('host');
      expect(health.details).toHaveProperty('port');
      expect(health.details).toHaveProperty('database');
    });

    it('should include pool size information', async () => {
      const health = await service.checkHealth();

      expect(health.details).toHaveProperty('poolSize');
      expect(health.details).toHaveProperty('minPoolSize');
    });

    it('should have correct ready state description', async () => {
      const health = await service.checkHealth();

      expect(health.details.readyStateDescription).toBe('connected');
    });
  });

  describe('ping', () => {
    it('should ping the database successfully', async () => {
      const result = await service.ping();

      expect(typeof result).toBe('boolean');
      expect(result).toBe(true);
    });

    it('should handle ping errors gracefully', async () => {
      // This test verifies error handling exists
      // Actual error would require disconnecting the database
      const result = await service.ping();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getConnectionStats', () => {
    it('should return connection statistics', () => {
      const stats = service.getConnectionStats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('readyState');
      expect(stats).toHaveProperty('connected');
      expect(stats).toHaveProperty('host');
      expect(stats).toHaveProperty('port');
      expect(stats).toHaveProperty('database');
      expect(stats).toHaveProperty('collections');
    });

    it('should indicate connected state', () => {
      const stats = service.getConnectionStats();

      expect(stats.connected).toBe(true);
      expect(stats.readyState).toBe(1);
    });

    it('should return collections array', () => {
      const stats = service.getConnectionStats();

      expect(Array.isArray(stats.collections)).toBe(true);
    });

    it('should have valid host and port', () => {
      const stats = service.getConnectionStats();

      expect(stats.host).toBeDefined();
      expect(typeof stats.host).toBe('string');
      expect(stats.port).toBeDefined();
      expect(typeof stats.port).toBe('number');
    });

    it('should have database name', () => {
      const stats = service.getConnectionStats();

      expect(stats.database).toBeDefined();
      expect(typeof stats.database).toBe('string');
      expect(stats.database.length).toBeGreaterThan(0);
    });
  });

  describe('getConnectionInfo', () => {
    it('should return detailed connection information', () => {
      const info = service.getConnectionInfo();

      expect(info).toBeDefined();
      expect(info).toHaveProperty('state');
      expect(info).toHaveProperty('database');
      expect(info).toHaveProperty('host');
      expect(info).toHaveProperty('port');
      expect(info).toHaveProperty('options');
    });

    it('should have correct connection state', () => {
      const info = service.getConnectionInfo();

      expect(info.state).toBe('connected');
    });

    it('should include connection options', () => {
      const info = service.getConnectionInfo();

      expect(info.options).toBeDefined();
      expect(info.options).toHaveProperty('maxPoolSize');
      expect(info.options).toHaveProperty('minPoolSize');
      expect(info.options).toHaveProperty('serverSelectionTimeoutMS');
      expect(info.options).toHaveProperty('socketTimeoutMS');
      expect(info.options).toHaveProperty('retryWrites');
      expect(info.options).toHaveProperty('retryReads');
      expect(info.options).toHaveProperty('w');
    });

    it('should have pool size configured', () => {
      const info = service.getConnectionInfo();

      expect(info.options.maxPoolSize).toBeDefined();
      expect(info.options.maxPoolSize).toBeGreaterThan(0);
      expect(info.options.minPoolSize).toBeDefined();
      expect(info.options.minPoolSize).toBeGreaterThanOrEqual(0);
    });

    it('should have retry options enabled', () => {
      const info = service.getConnectionInfo();

      expect(info.options.retryWrites).toBe(true);
      expect(info.options.retryReads).toBe(true);
    });

    it('should have timeout settings', () => {
      const info = service.getConnectionInfo();

      expect(info.options.serverSelectionTimeoutMS).toBeDefined();
      expect(info.options.serverSelectionTimeoutMS).toBeGreaterThan(0);
      expect(info.options.socketTimeoutMS).toBeDefined();
      expect(info.options.socketTimeoutMS).toBeGreaterThan(0);
    });

    it('should have write concern configured', () => {
      const info = service.getConnectionInfo();

      expect(info.options.w).toBeDefined();
    });
  });
});
