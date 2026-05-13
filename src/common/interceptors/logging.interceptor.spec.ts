import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LoggingInterceptor],
    }).compile();

    interceptor = module.get<LoggingInterceptor>(LoggingInterceptor);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    let mockExecutionContext: ExecutionContext;
    let mockCallHandler: CallHandler;
    let mockRequest: any;
    let mockResponse: any;

    beforeEach(() => {
      mockRequest = {
        method: 'GET',
        url: '/test',
        body: {},
        headers: {
          'user-agent': 'test-agent',
        },
        ip: '127.0.0.1',
        socket: {
          remoteAddress: '127.0.0.1',
        },
      };

      mockResponse = {
        statusCode: 200,
      };

      mockExecutionContext = {
        getType: jest.fn().mockReturnValue('http'),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
          getResponse: jest.fn().mockReturnValue(mockResponse),
        }),
      } as any;

      mockCallHandler = {
        handle: jest.fn().mockReturnValue(of({ data: 'test' })),
      };
    });

    it('should log incoming request', (done) => {
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Incoming Request: GET /test'),
          );
          done();
        },
      });
    });

    it('should log outgoing response with timing', (done) => {
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Outgoing Response: GET /test - Status: 200'),
          );
          done();
        },
      });
    });

    it('should log request body for POST requests', (done) => {
      mockRequest.method = 'POST';
      mockRequest.body = { name: 'test', password: 'secret' };
      const debugSpy = jest.spyOn(interceptor['logger'], 'debug');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(debugSpy).toHaveBeenCalledWith(
            expect.stringContaining('Request Body:'),
          );
          done();
        },
      });
    });

    it('should not log request body for GET requests', (done) => {
      mockRequest.method = 'GET';
      mockRequest.body = { name: 'test' };
      const debugSpy = jest.spyOn(interceptor['logger'], 'debug');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          const requestBodyCalls = debugSpy.mock.calls.filter((call) =>
            call[0].includes('Request Body:'),
          );
          expect(requestBodyCalls.length).toBe(0);
          done();
        },
      });
    });

    it('should log errors', (done) => {
      const error = new Error('Test error');
      mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => error));
      const errorSpy = jest.spyOn(interceptor['logger'], 'error');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: () => {
          expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Error Response: GET /test'),
          );
          done();
        },
      });
    });

    it('should include user ID in logs when authenticated', (done) => {
      mockRequest.user = { sub: 'user123', email: 'test@example.com' };
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('User: user123'),
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

  describe('sanitizeBody', () => {
    it('should redact password fields', () => {
      const body = {
        username: 'test',
        password: 'secret123',
        email: 'test@example.com',
      };

      const sanitized = interceptor['sanitizeBody'](body);

      expect(sanitized.username).toBe('test');
      expect(sanitized.password).toBe('***REDACTED***');
      expect(sanitized.email).toBe('test@example.com');
    });

    it('should redact token fields', () => {
      const body = {
        accessToken: 'token123',
        refreshToken: 'refresh456',
        data: 'public',
      };

      const sanitized = interceptor['sanitizeBody'](body);

      expect(sanitized.accessToken).toBe('***REDACTED***');
      expect(sanitized.refreshToken).toBe('***REDACTED***');
      expect(sanitized.data).toBe('public');
    });

    it('should recursively sanitize nested objects', () => {
      const body = {
        user: {
          name: 'test',
          password: 'secret',
        },
        settings: {
          apiKey: 'key123',
        },
      };

      const sanitized = interceptor['sanitizeBody'](body);

      expect(sanitized.user.name).toBe('test');
      expect(sanitized.user.password).toBe('***REDACTED***');
      expect(sanitized.settings.apiKey).toBe('***REDACTED***');
    });

    it('should handle non-object inputs', () => {
      expect(interceptor['sanitizeBody'](null)).toBeNull();
      expect(interceptor['sanitizeBody'](undefined)).toBeUndefined();
      expect(interceptor['sanitizeBody']('string')).toBe('string');
      expect(interceptor['sanitizeBody'](123)).toBe(123);
    });

    it('should redact all sensitive fields', () => {
      const body = {
        password: 'pass',
        passwordHash: 'hash',
        token: 'tok',
        accessToken: 'access',
        refreshToken: 'refresh',
        secret: 'sec',
        apiKey: 'key',
      };

      const sanitized = interceptor['sanitizeBody'](body);

      Object.values(sanitized).forEach((value) => {
        expect(value).toBe('***REDACTED***');
      });
    });
  });
});
