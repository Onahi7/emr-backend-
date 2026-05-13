import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { MongoError } from 'mongodb';
import { Error as MongooseError } from 'mongoose';

/**
 * Global exception filter that catches all exceptions and formats them consistently.
 * Handles HTTP exceptions, database errors, and unexpected errors.
 * Provides environment-specific error sanitization.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isProduction =
      this.configService.get<string>('app.nodeEnv') === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.buildErrorResponse(exception, request);

    // Log the error with appropriate level
    this.logError(exception, errorResponse, request);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  /**
   * Build a consistent error response based on the exception type
   */
  private buildErrorResponse(exception: unknown, request: Request) {
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    // Handle NestJS HTTP exceptions
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || message;
        error = responseObj.error || exception.name;
      }
    }
    // Handle MongoDB errors
    else if (this.isMongoError(exception)) {
      const mongoResponse = this.handleMongoError(exception);
      statusCode = mongoResponse.statusCode;
      message = mongoResponse.message;
      error = mongoResponse.error;
    }
    // Handle Mongoose validation errors
    else if (exception instanceof MongooseError.ValidationError) {
      statusCode = HttpStatus.BAD_REQUEST;
      message = this.extractValidationErrors(exception);
      error = 'Validation Error';
    }
    // Handle Mongoose cast errors (invalid ObjectId)
    else if (exception instanceof MongooseError.CastError) {
      statusCode = HttpStatus.BAD_REQUEST;
      message = `Invalid ${exception.path}: ${exception.value}`;
      error = 'Bad Request';
    }
    // Handle unexpected errors
    else if (exception instanceof Error) {
      // In production, sanitize error messages
      if (this.isProduction) {
        message = 'Internal server error';
        error = 'Internal Server Error';
      } else {
        message = exception.message;
        error = exception.name;
      }
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Add stack trace in development
    if (!this.isProduction && exception instanceof Error) {
      errorResponse.stack = exception.stack;
    }

    return errorResponse;
  }

  /**
   * Handle MongoDB-specific errors
   */
  private handleMongoError(error: MongoError): {
    statusCode: number;
    message: string;
    error: string;
  } {
    // Duplicate key error
    if (error.code === 11000) {
      const field = this.extractDuplicateField(error);
      return {
        statusCode: HttpStatus.CONFLICT,
        message: `${field} already exists`,
        error: 'Conflict',
      };
    }

    // Connection errors
    if (error.message.includes('connect') || error.message.includes('ECONNREFUSED')) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database connection error',
        error: 'Service Unavailable',
      };
    }

    // Default MongoDB error
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: this.isProduction
        ? 'Database error'
        : error.message,
      error: 'Internal Server Error',
    };
  }

  /**
   * Extract field name from MongoDB duplicate key error
   */
  private extractDuplicateField(error: MongoError): string {
    const match = error.message.match(/index: (\w+)_/);
    if (match && match[1]) {
      return match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }

    // Try to extract from keyValue
    const keyValue = (error as any).keyValue;
    if (keyValue) {
      const field = Object.keys(keyValue)[0];
      return field.charAt(0).toUpperCase() + field.slice(1);
    }

    return 'Resource';
  }

  /**
   * Extract validation error messages from Mongoose ValidationError
   */
  private extractValidationErrors(error: MongooseError.ValidationError): string[] {
    const messages: string[] = [];
    for (const field in error.errors) {
      const err = error.errors[field];
      messages.push(err.message);
    }
    return messages;
  }

  /**
   * Check if error is a MongoDB error
   */
  private isMongoError(error: unknown): error is MongoError {
    return error instanceof Error && 'code' in error && typeof (error as any).code === 'number';
  }

  /**
   * Log error with appropriate level based on status code
   */
  private logError(
    exception: unknown,
    errorResponse: ErrorResponse,
    request: Request,
  ) {
    const { statusCode, message, error } = errorResponse;
    const { method, url, ip } = request;

    const logMessage = `${method} ${url} - ${statusCode} ${error}: ${
      Array.isArray(message) ? message.join(', ') : message
    }`;

    // Log with different levels based on status code
    if (statusCode >= 500) {
      // Server errors - ERROR level with stack trace
      this.logger.error(logMessage, exception instanceof Error ? exception.stack : '');
    } else if (statusCode >= 400) {
      // Client errors - WARN level
      this.logger.warn(`${logMessage} - IP: ${ip}`);
    } else {
      // Other errors - DEBUG level
      this.logger.debug(logMessage);
    }
  }
}

/**
 * Standard error response interface
 */
export interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  stack?: string;
}
