import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import configuration from './configuration';
import { validate } from './env.validation';

/**
 * Configuration Module
 * Provides centralized configuration management with validation
 */
@Module({
  imports: [ //did alot and left 
    NestConfigModule.forRoot({
      isGlobal: true, // Makes ConfigService available globally
      load: [configuration], // Load configuration factory
      validate, // Validate environment variables on startup
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
      cache: true, // Cache configuration for better performance
    }),
  ],
})
export class ConfigModule {}
