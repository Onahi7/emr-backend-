import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AuditLoggingInterceptor } from './audit-logging.interceptor';

describe('AuditLoggingInterceptor', () => {
  let interceptor: AuditLoggingInterceptor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditLoggingInterceptor],
    }).compile();

    interceptor = module.get<AuditLoggingInterceptor>(AuditLoggingInterceptor);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    let mockExecutionContext: ExecutionContext;
    let mockCallHandler: CallHandler;
    let mockRequest: any;

    beforeEach(() => {
      mockRequest = {
        method: 'POST',
        url: '/patients',
        body: { firstName: 'John', lastName: 'Doe' },
        headers: {
          'user-agent': 'test-agent',
        },
        ip: '127.0.0.1',
        socket: {
          remoteAddress: '127.0.0.1',
        },
        user: {
          sub: 'user123',
          email: 'test@example.com',
        },
      };

      mockExecutionContext = {
        getType: jest.fn().mockReturnValue('http'),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as any;

      mockCallHandler = {
        handle: jest.fn().mockReturnValue(of({ id: 'new-id-123' })),
      };
    });

    it('should audit POST requests as INSERT', (done) => {
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Audit: INSERT on patients'),
          );
          done();
        },
      });
    });

    it('should audit PATCH requests as UPDATE', (done) => {
      mockRequest.method = 'PATCH';
      mockRequest.url = '/patients/123';
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Audit: UPDATE on patients/123'),
          );
          done();
        },
      });
    });

    it('should audit PUT requests as UPDATE', (done) => {
      mockRequest.method = 'PUT';
      mockRequest.url = '/patients/123';
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Audit: UPDATE on patients/123'),
          );
          done();
        },
      });
    });

    it('should audit DELETE requests', (done) => {
      mockRequest.method = 'DELETE';
      mockRequest.url = '/patients/123';
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Audit: DELETE on patients/123'),
          );
          done();
        },
      });
    });

    it('should not audit GET requests', (done) => {
      mockRequest.method = 'GET';
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(logSpy).not.toHaveBeenCalled();
          done();
        },
      });
    });

    it('should include user ID in audit logs', (done) => {
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('by user user123'),
          );
          done();
        },
      });
    });

    it('should log Anonymous for unauthenticated requests', (done) => {
      mockRequest.user = undefined;
      const debugSpy = jest.spyOn(interceptor['logger'], 'debug');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          const auditDetailsCalls = debugSpy.mock.calls.filter((call) =>
            call[0].includes('Audit Details:'),
          );
          expect(auditDetailsCalls.length).toBeGreaterThan(0);
          expect(auditDetailsCalls[0][0]).toContain('Anonymous');
          done();
        },
      });
    });

    it('should log audit details in debug mode', (done) => {
      const debugSpy = jest.spyOn(interceptor['logger'], 'debug');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(debugSpy).toHaveBeenCalledWith(
            expect.stringContaining('Audit Details:'),
          );
          done();
        },
      });
    });

    it('should log successful operation completion', (done) => {
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Audit Success: INSERT on patients completed successfully'),
          );
          done();
        },
      });
    });

    it('should log new record ID for INSERT operations', (done) => {
      const debugSpy = jest.spyOn(interceptor['logger'], 'debug');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(debugSpy).toHaveBeenCalledWith(
            expect.stringContaining('New Record ID: new-id-123'),
          );
          done();
        },
      });
    });

    it('should log failed operations', (done) => {
      const error = new Error('Database error');
      mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => error));
      const warnSpy = jest.spyOn(interceptor['logger'], 'warn');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: () => {
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Audit Failure: INSERT on patients failed'),
          );
          done();
        },
      });
    });

    it('should extract resource name from URL', (done) => {
      mockRequest.url = '/orders/123/cancel';
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('on orders'),
          );
          done();
        },
      });
    });

    it('should extract record ID from URL', (done) => {
      mockRequest.method = 'PATCH';
      mockRequest.url = '/patients/patient-123';
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('patients/patient-123'),
          );
          done();
        },
      });
    });

    it('should skip non-HTTP contexts', (done) => {
      mockExecutionContext.getType = jest.fn().mockReturnValue('ws');
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(logSpy).not.toHaveBeenCalled();
          done();
        },
      });
    });
  });

  describe('sanitizeData', () => {
    it('should redact password fields', () => {
      const data = {
        username: 'test',
        password: 'secret123',
        email: 'test@example.com',
      };

      const sanitized = interceptor['sanitizeData'](data);

      expect(sanitized.username).toBe('test');
      expect(sanitized.password).toBe('***REDACTED***');
      expect(sanitized.email).toBe('test@example.com');
    });

    it('should redact token fields', () => {
      const data = {
        accessToken: 'token123',
        refreshToken: 'refresh456',
        data: 'public',
      };

      const sanitized = interceptor['sanitizeData'](data);

      expect(sanitized.accessToken).toBe('***REDACTED***');
      expect(sanitized.refreshToken).toBe('***REDACTED***');
      expect(sanitized.data).toBe('public');
    });

    it('should recursively sanitize nested objects', () => {
      const data = {
        user: {
          name: 'test',
          password: 'secret',
        },
        auth: {
          token: 'token123',
        },
      };

      const sanitized = interceptor['sanitizeData'](data);

      expect(sanitized.user.name).toBe('test');
      expect(sanitized.user.password).toBe('***REDACTED***');
      expect(sanitized.auth.token).toBe('***REDACTED***');
    });

    it('should handle non-object inputs', () => {
      expect(interceptor['sanitizeData'](null)).toBeNull();
      expect(interceptor['sanitizeData'](undefined)).toBeUndefined();
      expect(interceptor['sanitizeData']('string')).toBe('string');
      expect(interceptor['sanitizeData'](123)).toBe(123);
    });

    it('should redact all sensitive fields', () => {
      const data = {
        password: 'pass',
        passwordHash: 'hash',
        token: 'tok',
        accessToken: 'access',
        refreshToken: 'refresh',
        secret: 'sec',
        apiKey: 'key',
      };

      const sanitized = interceptor['sanitizeData'](data);

      Object.values(sanitized).forEach((value) => {
        expect(value).toBe('***REDACTED***');
      });
    });
  });
});
