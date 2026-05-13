import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

/**
 * Environment variables validation schema
 * Ensures all required environment variables are present and valid
 */
export enum Environment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  // Application
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Min(1)
  @IsOptional()
  PORT: number = 3000;

  // Database
  @IsString()
  MONGODB_URI!: string;

  // JWT Authentication
  @IsString()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_TOKEN_EXPIRY: string = '1h';

  @IsString()
  @IsOptional()
  JWT_REFRESH_TOKEN_EXPIRY: string = '7d';

  // CORS
  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = 'http://localhost:5173';

  // Logging
  @IsString()
  @IsOptional()
  LOG_LEVEL: string = 'info';

  // Rate Limiting
  @IsNumber()
  @Min(1)
  @IsOptional()
  RATE_LIMIT_TTL: number = 60;

  @IsNumber()
  @Min(1)
  @IsOptional()
  RATE_LIMIT_MAX: number = 100;

  // File Upload
  @IsNumber()
  @Min(1)
  @IsOptional()
  MAX_FILE_SIZE: number = 5242880; // 5MB

  @IsString()
  @IsOptional()
  ALLOWED_MIME_TYPES?: string;

  // Email (Optional)
  @IsString()
  @IsOptional()
  EMAIL_HOST?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  EMAIL_PORT: number = 587;

  @IsString()
  @IsOptional()
  EMAIL_SECURE: string = 'false';

  @IsString()
  @IsOptional()
  EMAIL_USER?: string;

  @IsString()
  @IsOptional()
  EMAIL_PASSWORD?: string;

  @IsString()
  @IsOptional()
  EMAIL_FROM: string = 'noreply@lis.com';

  // SMS (Optional)
  @IsString()
  @IsOptional()
  SMS_PROVIDER: string = 'twilio';

  @IsString()
  @IsOptional()
  SMS_ACCOUNT_SID?: string;

  @IsString()
  @IsOptional()
  SMS_AUTH_TOKEN?: string;

  @IsString()
  @IsOptional()
  SMS_FROM_NUMBER?: string;
}

/**
 * Validates environment variables against the schema
 * Throws an error if validation fails
 */
export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => {
        const constraints = Object.values(error.constraints || {});
        return `${error.property}: ${constraints.join(', ')}`;
      })
      .join('\n');

    throw new Error(`Environment validation failed:\n${errorMessages}`);
  }

  return validatedConfig;
}
