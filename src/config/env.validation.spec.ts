import 'reflect-metadata';
import { validate, EnvironmentVariables, Environment } from './env.validation';

describe('Environment Validation', () => {
  describe('validate function', () => {
    it('should validate correct environment variables', () => {
      const config = {
        NODE_ENV: 'development',
        PORT: '3000',
        MONGODB_URI: 'mongodb://localhost:27017/lis',
        JWT_SECRET: 'test-secret-key',
        JWT_REFRESH_SECRET: 'test-refresh-secret-key',
      };

      expect(() => validate(config)).not.toThrow();
    });

    it('should throw error when MONGODB_URI is missing', () => {
      const config = {
        NODE_ENV: 'development',
        PORT: '3000',
        JWT_SECRET: 'test-secret-key',
        JWT_REFRESH_SECRET: 'test-refresh-secret-key',
      };

      expect(() => validate(config)).toThrow('Environment validation failed');
      expect(() => validate(config)).toThrow('MONGODB_URI');
    });

    it('should throw error when JWT_SECRET is missing', () => {
      const config = {
        NODE_ENV: 'development',
        PORT: '3000',
        MONGODB_URI: 'mongodb://localhost:27017/lis',
        JWT_REFRESH_SECRET: 'test-refresh-secret-key',
      };

      expect(() => validate(config)).toThrow('Environment validation failed');
      expect(() => validate(config)).toThrow('JWT_SECRET');
    });

    it('should throw error when JWT_REFRESH_SECRET is missing', () => {
      const config = {
        NODE_ENV: 'development',
        PORT: '3000',
        MONGODB_URI: 'mongodb://localhost:27017/lis',
        JWT_SECRET: 'test-secret-key',
      };

      expect(() => validate(config)).toThrow('Environment validation failed');
      expect(() => validate(config)).toThrow('JWT_REFRESH_SECRET');
    });

    it('should throw error when NODE_ENV has invalid value', () => {
      const config = {
        NODE_ENV: 'invalid',
        PORT: '3000',
        MONGODB_URI: 'mongodb://localhost:27017/lis',
        JWT_SECRET: 'test-secret-key',
        JWT_REFRESH_SECRET: 'test-refresh-secret-key',
      };

      expect(() => validate(config)).toThrow('Environment validation failed');
      expect(() => validate(config)).toThrow('NODE_ENV');
    });

    it('should throw error when PORT is not a number', () => {
      const config = {
        NODE_ENV: 'development',
        PORT: 'not-a-number',
        MONGODB_URI: 'mongodb://localhost:27017/lis',
        JWT_SECRET: 'test-secret-key',
        JWT_REFRESH_SECRET: 'test-refresh-secret-key',
      };

      expect(() => validate(config)).toThrow('Environment validation failed');
    });

    it('should apply default values for optional variables', () => {
      const config = {
        MONGODB_URI: 'mongodb://localhost:27017/lis',
        JWT_SECRET: 'test-secret-key',
        JWT_REFRESH_SECRET: 'test-refresh-secret-key',
      };

      const result = validate(config);

      expect(result.NODE_ENV).toBe(Environment.Development);
      expect(result.PORT).toBe(3000);
      expect(result.JWT_EXPIRES_IN).toBe('1h');
      expect(result.JWT_REFRESH_EXPIRES_IN).toBe('7d');
      expect(result.CORS_ORIGIN).toBe('http://localhost:5173');
      expect(result.LOG_LEVEL).toBe('info');
    });

    it('should convert string numbers to actual numbers', () => {
      const config = {
        NODE_ENV: 'development',
        PORT: '4000',
        MONGODB_URI: 'mongodb://localhost:27017/lis',
        JWT_SECRET: 'test-secret-key',
        JWT_REFRESH_SECRET: 'test-refresh-secret-key',
        RATE_LIMIT_TTL: '120',
        RATE_LIMIT_MAX: '200',
        MAX_FILE_SIZE: '10485760',
      };

      const result = validate(config);

      expect(result.PORT).toBe(4000);
      expect(typeof result.PORT).toBe('number');
      expect(result.RATE_LIMIT_TTL).toBe(120);
      expect(typeof result.RATE_LIMIT_TTL).toBe('number');
      expect(result.RATE_LIMIT_MAX).toBe(200);
      expect(typeof result.RATE_LIMIT_MAX).toBe('number');
      expect(result.MAX_FILE_SIZE).toBe(10485760);
      expect(typeof result.MAX_FILE_SIZE).toBe('number');
    });
  });

  describe('EnvironmentVariables class', () => {
    it('should have correct default values', () => {
      const env = new EnvironmentVariables();

      expect(env.NODE_ENV).toBe(Environment.Development);
      expect(env.PORT).toBe(3000);
      expect(env.JWT_EXPIRES_IN).toBe('1h');
      expect(env.JWT_REFRESH_EXPIRES_IN).toBe('7d');
      expect(env.CORS_ORIGIN).toBe('http://localhost:5173');
      expect(env.LOG_LEVEL).toBe('info');
      expect(env.RATE_LIMIT_TTL).toBe(60);
      expect(env.RATE_LIMIT_MAX).toBe(100);
      expect(env.MAX_FILE_SIZE).toBe(5242880);
      expect(env.EMAIL_PORT).toBe(587);
      expect(env.EMAIL_SECURE).toBe('false');
      expect(env.EMAIL_FROM).toBe('noreply@lis.com');
      expect(env.SMS_PROVIDER).toBe('twilio');
    });
  });
});
