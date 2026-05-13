import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseHealthService } from './database-health.service';

/**
 * Database Module
 * 
 * Configures MongoDB connection using Mongoose with:
 * - Connection pooling for optimal performance
 * - Automatic retry logic for connection failures
 * - Error handling and logging
 * - Support for both local MongoDB and MongoDB Atlas
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const uri = configService.get<string>('database.uri');
        const nodeEnv = configService.get<string>('app.nodeEnv');

        return {
          uri,
          
          // Connection pooling configuration
          // Requirement 3.3: Configure connection pooling for optimal performance
          maxPoolSize: 10, // Maximum number of connections in the pool
          minPoolSize: 2,  // Minimum number of connections to maintain
          
          // Connection timeout settings
          serverSelectionTimeoutMS: 5000, // Timeout for initial connection
          socketTimeoutMS: 45000,          // Timeout for socket operations
          
          // Retry logic configuration
          // Requirement 3.4: Implement connection error handling and retry logic
          retryWrites: true,               // Automatically retry write operations
          retryReads: true,                // Automatically retry read operations
          maxIdleTimeMS: 10000,            // Close idle connections after 10 seconds
          
          // Write concern for data durability
          // Requirement 3.5: Support both local MongoDB and MongoDB Atlas
          w: 'majority',                   // Wait for majority of replica set members
          
          // Connection event handlers
          // Requirement 3.4: Add connection error handling
          connectionFactory: (connection) => {
            connection.on('connected', () => {
              console.log('✅ MongoDB connected successfully');
              console.log(`📍 Database: ${connection.name}`);
            });

            connection.on('disconnected', () => {
              console.warn('⚠️  MongoDB disconnected');
            });

            connection.on('error', (error: any) => {
              console.error('❌ MongoDB connection error:', error.message);
            });

            connection.on('reconnected', () => {
              console.log('🔄 MongoDB reconnected');
            });

            connection.on('reconnectFailed', () => {
              console.error('❌ MongoDB reconnection failed after multiple attempts');
            });

            return connection;
          },
          
          // Auto-index creation (disable in production for performance)
          autoIndex: nodeEnv !== 'production',
          
          // Auto-create collections
          autoCreate: true,
        };
      },
    }),
  ],
  providers: [DatabaseHealthService],
  exports: [MongooseModule, DatabaseHealthService],
})
export class DatabaseModule {}
