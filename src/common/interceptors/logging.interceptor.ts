import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

/**
 * Logging Interceptor
 * 
 * Logs all incoming HTTP requests and outgoing responses with timing information.
 * Provides detailed logging for debugging and monitoring purposes.
 * 
 * Logs include:
 * - HTTP method and URL
 * - Request body (sanitized)
 * - Response status code
 * - Response time in milliseconds
 * - User information (if authenticated)
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url, body, headers } = request;
    const userAgent = headers['user-agent'] || 'Unknown';
    const ip = request.ip || request.socket.remoteAddress || 'Unknown';

    // Extract user info if available (will be set by auth guard)
    const user = (request as any).user;
    const userId = user?.sub || user?.id || 'Anonymous';

    const startTime = Date.now();

    // Log incoming request
    this.logger.log(
      `Incoming Request: ${method} ${url} - User: ${userId} - IP: ${ip}`,
    );

    // Log request body for non-GET requests (sanitize sensitive data)
    if (method !== 'GET' && body && Object.keys(body).length > 0) {
      const sanitizedBody = this.sanitizeBody(body);
      this.logger.debug(`Request Body: ${JSON.stringify(sanitizedBody)}`);
    }

    return next.handle().pipe(
      tap({
        next: (data: any) => {
          const responseTime = Date.now() - startTime;
          const statusCode = response.statusCode;

          this.logger.log(
            `Outgoing Response: ${method} ${url} - Status: ${statusCode} - ${responseTime}ms`,
          );

          // Log response data in debug mode (truncate if too large)
          if (data) {
            const responseData =
              typeof data === 'object' ? JSON.stringify(data) : String(data);
            const truncatedData =
              responseData.length > 500
                ? responseData.substring(0, 500) + '...'
                : responseData;
            this.logger.debug(`Response Data: ${truncatedData}`);
          }
        },
        error: (error: Error) => {
          const responseTime = Date.now() - startTime;
          const statusCode = response.statusCode || 500;

          this.logger.error(
            `Error Response: ${method} ${url} - Status: ${statusCode} - ${responseTime}ms - Error: ${error.message}`,
          );
        },
      }),
    );
  }

  /**
   * Sanitize request body to remove sensitive information
   * Removes password, token, and other sensitive fields
   */
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sensitiveFields = [
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'apiKey',
    ];

    const sanitized = { ...body };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }

    // Recursively sanitize nested objects
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeBody(sanitized[key]);
      }
    }

    return sanitized;
  }
}
