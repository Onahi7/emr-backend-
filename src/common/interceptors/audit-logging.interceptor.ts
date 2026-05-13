import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

/**
 * Audit Logging Interceptor
 * 
 * Captures all create, update, and delete operations for audit trail purposes.
 * This interceptor logs mutations (POST, PATCH, PUT, DELETE) to track system changes.
 * 
 * Audit logs include:
 * - User ID (who performed the action)
 * - Action type (INSERT, UPDATE, DELETE)
 * - Resource/table name (extracted from URL)
 * - Record ID (if available)
 * - Request data (for creates and updates)
 * - IP address and user agent
 * - Timestamp
 * 
 * Note: This is a basic implementation. In a production system, audit logs
 * should be stored in a database (audit_logs collection) for compliance and
 * security purposes. This will be implemented in Task 15 (Audit Logging Module).
 * 
 * Validates: Requirements 2.6, 15.7
 */
@Injectable()
export class AuditLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, body, headers } = request;

    // Only audit mutation operations
    const mutationMethods = ['POST', 'PATCH', 'PUT', 'DELETE'];
    if (!mutationMethods.includes(method)) {
      return next.handle();
    }

    // Extract user info if available
    const user = (request as any).user;
    const userId = user?.sub || user?.id || 'Anonymous';

    // Extract IP address and user agent
    const ipAddress = request.ip || request.socket.remoteAddress || 'Unknown';
    const userAgent = headers['user-agent'] || 'Unknown';

    // Extract resource name from URL (e.g., /patients/123 -> patients)
    const resourceMatch = url.match(/^\/([^/?]+)/);
    const resourceName = resourceMatch ? resourceMatch[1] : 'unknown';

    // Extract record ID from URL if present (e.g., /patients/123 -> 123)
    const recordIdMatch = url.match(/\/([^/?]+)$/);
    const recordId =
      recordIdMatch && recordIdMatch[1] !== resourceName
        ? recordIdMatch[1]
        : null;

    // Map HTTP method to audit action
    const actionMap: Record<string, string> = {
      POST: 'INSERT',
      PATCH: 'UPDATE',
      PUT: 'UPDATE',
      DELETE: 'DELETE',
    };
    const action = actionMap[method] || method;

    // Log the audit entry
    const auditEntry = {
      timestamp: new Date().toISOString(),
      userId,
      action,
      tableName: resourceName,
      recordId,
      ipAddress,
      userAgent,
      requestData: this.sanitizeData(body),
    };

    this.logger.log(
      `Audit: ${action} on ${resourceName}${recordId ? `/${recordId}` : ''} by user ${userId}`,
    );
    this.logger.debug(`Audit Details: ${JSON.stringify(auditEntry)}`);

    return next.handle().pipe(
      tap({
        next: (data: any) => {
          // Log successful operation
          this.logger.log(
            `Audit Success: ${action} on ${resourceName}${recordId ? `/${recordId}` : ''} completed successfully`,
          );

          // If this is a CREATE operation, log the new record ID
          if (action === 'INSERT' && data?.id) {
            this.logger.debug(`New Record ID: ${data.id}`);
          }
        },
        error: (error: Error) => {
          // Log failed operation
          this.logger.warn(
            `Audit Failure: ${action} on ${resourceName}${recordId ? `/${recordId}` : ''} failed - ${error.message}`,
          );
        },
      }),
    );
  }

  /**
   * Sanitize data to remove sensitive information from audit logs
   */
  private sanitizeData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
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

    const sanitized = { ...data };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }

    // Recursively sanitize nested objects
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeData(sanitized[key]);
      }
    }

    return sanitized;
  }
}
