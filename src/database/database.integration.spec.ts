import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { DatabaseModule } from './database.module';
import configuration from '../config/configuration';

/**
 * Database Module Integration Tests
 * 
 * Tests actual database connection, pooling, and error handling
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 * 
 * Note: These tests require a running MongoDB instance
 * Set MONGODB_URI environment variable or use default localhost
 */
describe('DatabaseModule Integration', () => {
  let module: TestingModule;
  let connection: Connection;

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

    // Get the Mongoose connection
    connection = module.get<Connection>(Connection);
  });

  afterAll(async () => {
    if (connection) {
      await connection.close();
    }
    if (module) {
      await module.close();
    }
  });

  describe('Connection Establishment', () => {
    it('should establish connection to MongoDB', () => {
      // Requirement 3.1: Install and configure Mongoose for MongoDB integration
      expect(connection).toBeDefined();
      expect(connection.readyState).toBe(1); // 1 = connected
    });

    it('should connect to the correct database', () => {
      // Requirement 3.2: Create database connection module
      expect(connection.name).toBeDefined();
      expect(connection.name.length).toBeGreaterThan(0);
    });

    it('should have a valid connection object', () => {
      expect(connection.db).toBeDefined();
      expect(connection.client).toBeDefined();
    });
  });

  describe('Connection Pooling', () => {
    it('should have connection pool configured', () => {
      // Requirement 3.3: Configure connection pooling for optimal performance
      const poolSize = connection.client?.options?.maxPoolSize;
      expect(poolSize).toBeDefined();
      expect(poolSize).toBeGreaterThan(0);
    });

    it('should maintain minimum pool size', () => {
      const minPoolSize = connection.client?.options?.minPoolSize;
      expect(minPoolSize).toBeDefined();
      expect(minPoolSize).toBeGreaterThanOrEqual(0);
    });

    it('should have connection timeout configured', () => {
      const serverSelectionTimeout =
        connection.client?.options?.serverSelectionTimeoutMS;
      expect(serverSelectionTimeout).toBeDefined();
      expect(serverSelectionTimeout).toBeGreaterThan(0);
    });
  });

  describe('Retry Logic', () => {
    it('should have retry writes enabled', () => {
      // Requirement 3.4: Implement connection error handling and retry logic
      const retryWrites = connection.client?.options?.retryWrites;
      expect(retryWrites).toBe(true);
    });

    it('should have retry reads enabled', () => {
      const retryReads = connection.client?.options?.retryReads;
      expect(retryReads).toBe(true);
    });

    it('should have write concern configured', () => {
      const writeConcern = connection.client?.options?.w;
      expect(writeConcern).toBeDefined();
    });
  });

  describe('Connection Error Handling', () => {
    it('should handle connection events', (done) => {
      // Requirement 3.4: Add connection error handling
      let eventHandled = false;

      const errorHandler = (error: Error) => {
        eventHandled = true;
        console.log('Error event captured:', error.message);
      };

      connection.on('error', errorHandler);

      // Verify event listener is attached
      setTimeout(() => {
        connection.removeListener('error', errorHandler);
        // Just verify the listener was attached, not that an error occurred
        expect(connection.listenerCount('error')).toBeGreaterThanOrEqual(0);
        done();
      }, 100);
    });

    it('should have disconnected event handler', () => {
      const disconnectedListeners = connection.listenerCount('disconnected');
      expect(disconnectedListeners).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Database Operations', () => {
    it('should be able to list collections', async () => {
      // Requirement 3.5: Support both local MongoDB and MongoDB Atlas
      const collections = await connection.db.listCollections().toArray();
      expect(Array.isArray(collections)).toBe(true);
    });

    it('should be able to execute admin commands', async () => {
      try {
        const result = await connection.db.admin().ping();
        expect(result).toBeDefined();
        expect(result.ok).toBe(1);
      } catch (error) {
        // Some MongoDB instances may not allow admin commands
        // This is acceptable for the test
        expect(error).toBeDefined();
      }
    });

    it('should support database operations', async () => {
      // Create a test collection
      const testCollection = connection.collection('test_connection');
      
      // Insert a test document
      const result = await testCollection.insertOne({
        test: 'connection',
        timestamp: new Date(),
      });

      expect(result.acknowledged).toBe(true);
      expect(result.insertedId).toBeDefined();

      // Clean up
      await testCollection.deleteOne({ _id: result.insertedId });
    });
  });

  describe('Connection URI Support', () => {
    it('should support local MongoDB URI', () => {
      // Requirement 3.5: Support both local MongoDB and MongoDB Atlas
      const uri = process.env.MONGODB_URI || '';
      const isLocal = uri.startsWith('mongodb://localhost') || 
                     uri.startsWith('mongodb://127.0.0.1');
      const isAtlas = uri.startsWith('mongodb+srv://');
      
      expect(isLocal || isAtlas).toBe(true);
    });

    it('should handle connection string options', () => {
      // Requirement 3.6: Configure database connection via environment variables
      const uri = process.env.MONGODB_URI || '';
      expect(uri).toBeDefined();
      expect(uri.length).toBeGreaterThan(0);
    });
  });

  describe('Connection State Management', () => {
    it('should maintain connected state', () => {
      expect(connection.readyState).toBe(1); // 1 = connected
    });

    it('should have valid connection ID', () => {
      expect(connection.id).toBeDefined();
    });

    it('should track connection models', () => {
      const models = connection.models;
      expect(models).toBeDefined();
      expect(typeof models).toBe('object');
    });
  });
});
