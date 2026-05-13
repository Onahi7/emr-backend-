import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpExceptionFilter, ErrorResponse } from './http-exception.filter';
import { MongoError } from 'mongodb';
import { Error as MongooseError } from 'mongoose';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let configService: ConfigService;

  const mockRequest = {
    url: '/test',
    method: 'GET',
    ip: '127.0.0.1',
  };

  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  const mockArgumentsHost = {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: () => mockResponse,
      getRequest: () => mockRequest,
    }),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'app.nodeEnv') return 'development';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    configService = module.get<ConfigService>(ConfigService);
    filter = new HttpExceptionFilter(configService);

    // Reset mocks
    mockResponse.status.mockClear();
    mockResponse.json.mockClear();
  });

  describe('HTTP Exceptions', () => {
    it('should handle BadRequestException (400)', () => {
      const exception = new BadRequestException('Invalid input');

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid input',
          error: 'Bad Request',
          timestamp: expect.any(String),
          path: '/test',
        }),
      );
    });

    it('should handle UnauthorizedException (401)', () => {
      const exception = new UnauthorizedException('Unauthorized');

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Unauthorized',
          error: 'Unauthorized',
        }),
      );
    });

    it('should handle ForbiddenException (403)', () => {
      const exception = new ForbiddenException('Insufficient permissions');

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.FORBIDDEN,
          message: 'Insufficient permissions',
          error: 'Forbidden',
        }),
      );
    });

    it('should handle NotFoundException (404)', () => {
      const exception = new NotFoundException('Patient with ID 123 not found');

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Patient with ID 123 not found',
          error: 'Not Found',
        }),
      );
    });

    it('should handle ConflictException (409)', () => {
      const exception = new ConflictException('Email already exists');

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          message: 'Email already exists',
          error: 'Conflict',
        }),
      );
    });

    it('should handle InternalServerErrorException (500)', () => {
      const exception = new InternalServerErrorException('Server error');

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Server error',
          error: 'Internal Server Error',
        }),
      );
    });

    it('should handle validation errors with array of messages', () => {
      const exception = new BadRequestException([
        'firstName must be a string',
        'email must be a valid email',
      ]);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: [
            'firstName must be a string',
            'email must be a valid email',
          ],
          error: 'Bad Request',
        }),
      );
    });
  });

  describe('MongoDB Errors', () => {
    it('should handle duplicate key error (11000)', () => {
      const mongoError = new MongoError('E11000 duplicate key error');
      (mongoError as any).code = 11000;
      (mongoError as any).keyValue = { email: 'test@example.com' };

      filter.catch(mongoError, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          message: 'Email already exists',
          error: 'Conflict',
        }),
      );
    });

    it('should handle connection errors', () => {
      const mongoError = new MongoError('connect ECONNREFUSED');
      (mongoError as any).code = 0;

      filter.catch(mongoError, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Database connection error',
          error: 'Service Unavailable',
        }),
      );
    });
  });

  describe('Mongoose Errors', () => {
    it('should handle ValidationError', () => {
      const validationError = new MongooseError.ValidationError();
      validationError.errors = {
        firstName: {
          message: 'firstName is required',
        } as any,
        email: {
          message: 'email must be a valid email',
        } as any,
      };

      filter.catch(validationError, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: expect.arrayContaining([
            'firstName is required',
            'email must be a valid email',
          ]),
          error: 'Validation Error',
        }),
      );
    });

    it('should handle CastError (invalid ObjectId)', () => {
      const castError = new MongooseError.CastError(
        'ObjectId',
        'invalid-id',
        '_id',
      );

      filter.catch(castError, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid _id: invalid-id',
          error: 'Bad Request',
        }),
      );
    });
  });

  describe('Generic Errors', () => {
    it('should handle generic Error in development', () => {
      const error = new Error('Something went wrong');

      filter.catch(error, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Something went wrong',
          error: 'Error',
          stack: expect.any(String),
        }),
      );
    });

    it('should sanitize generic Error in production', () => {
      // Mock production environment
      jest.spyOn(configService, 'get').mockReturnValue('production');
      filter = new HttpExceptionFilter(configService);

      const error = new Error('Sensitive error details');

      filter.catch(error, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          error: 'Internal Server Error',
        }),
      );

      // Should not include stack trace in production
      const jsonCall = mockResponse.json.mock.calls[0][0];
      expect(jsonCall.stack).toBeUndefined();
    });

    it('should handle unknown error types', () => {
      const unknownError = 'string error';

      filter.catch(unknownError, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          error: 'Internal Server Error',
        }),
      );
    });
  });

  describe('Error Response Format', () => {
    it('should include all required fields in error response', () => {
      const exception = new BadRequestException('Test error');

      filter.catch(exception, mockArgumentsHost);

      const errorResponse = mockResponse.json.mock.calls[0][0] as ErrorResponse;

      expect(errorResponse).toHaveProperty('statusCode');
      expect(errorResponse).toHaveProperty('message');
      expect(errorResponse).toHaveProperty('error');
      expect(errorResponse).toHaveProperty('timestamp');
      expect(errorResponse).toHaveProperty('path');
      expect(errorResponse.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it('should include stack trace in development', () => {
      const error = new Error('Test error');

      filter.catch(error, mockArgumentsHost);

      const errorResponse = mockResponse.json.mock.calls[0][0] as ErrorResponse;
      expect(errorResponse.stack).toBeDefined();
    });

    it('should not include stack trace in production', () => {
      jest.spyOn(configService, 'get').mockReturnValue('production');
      filter = new HttpExceptionFilter(configService);

      const error = new Error('Test error');

      filter.catch(error, mockArgumentsHost);

      const errorResponse = mockResponse.json.mock.calls[0][0] as ErrorResponse;
      expect(errorResponse.stack).toBeUndefined();
    });
  });

  describe('Error Logging', () => {
    it('should log 500 errors at ERROR level', () => {
      const loggerSpy = jest.spyOn(filter['logger'], 'error');
      const exception = new InternalServerErrorException('Server error');

      filter.catch(exception, mockArgumentsHost);

      expect(loggerSpy).toHaveBeenCalled();
    });

    it('should log 400 errors at WARN level', () => {
      const loggerSpy = jest.spyOn(filter['logger'], 'warn');
      const exception = new BadRequestException('Bad request');

      filter.catch(exception, mockArgumentsHost);

      expect(loggerSpy).toHaveBeenCalled();
    });
  });
});
