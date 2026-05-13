import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, Controller, Get, Post, Body, Param, HttpStatus } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import request from 'supertest';
import { HttpExceptionFilter } from './http-exception.filter';
import { IsString, IsEmail, IsNotEmpty } from 'class-validator';

// Test DTO for validation
class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  email: string;
}

// Test controller
@Controller('test')
class TestController {
  @Get('success')
  getSuccess() {
    return { message: 'Success' };
  }

  @Get('error')
  getError() {
    throw new Error('Test error');
  }

  @Get('not-found/:id')
  getNotFound(@Param('id') id: string) {
    throw new Error('Not found');
  }

  @Post('validate')
  validateData(@Body() dto: CreateUserDto) {
    return { message: 'Valid data', data: dto };
  }
}

describe('HttpExceptionFilter Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              app: {
                nodeEnv: 'test',
                port: 3000,
              },
            }),
          ],
        }),
      ],
      controllers: [TestController],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply global exception filter
    const configService = app.get(ConfigService);
    app.useGlobalFilters(new HttpExceptionFilter(configService));

    // Apply global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Successful Requests', () => {
    it('should return 200 for successful request', async () => {
      const response = await request(app.getHttpServer())
        .get('/test/success')
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({ message: 'Success' });
    });
  });

  describe('Validation Errors', () => {
    it('should return 400 with validation errors for missing fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .send({})
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        timestamp: expect.any(String),
        path: '/test/validate',
      });

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('firstName'),
          expect.stringContaining('lastName'),
          expect.stringContaining('email'),
        ]),
      );
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'invalid-email',
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
      });

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('email')]),
      );
    });

    it('should return 400 for extra fields when forbidNonWhitelisted is true', async () => {
      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          extraField: 'should not be allowed',
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
      });
    });

    it('should return 200 for valid data', async () => {
      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        })
        .expect(HttpStatus.CREATED); // POST returns 201 Created by default

      expect(response.body).toMatchObject({
        message: 'Valid data',
        data: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
      });
    });
  });

  describe('Generic Errors', () => {
    it('should return 500 for unhandled errors', async () => {
      const response = await request(app.getHttpServer())
        .get('/test/error')
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);

      expect(response.body).toMatchObject({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Test error',
        error: 'Error',
        timestamp: expect.any(String),
        path: '/test/error',
      });

      // Should include stack trace in test environment
      expect(response.body.stack).toBeDefined();
    });
  });

  describe('Not Found Errors', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app.getHttpServer())
        .get('/non-existent-route')
        .expect(HttpStatus.NOT_FOUND);

      expect(response.body).toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        timestamp: expect.any(String),
        path: '/non-existent-route',
      });
    });
  });

  describe('Error Response Format', () => {
    it('should always include required fields in error response', async () => {
      const response = await request(app.getHttpServer())
        .post('/test/validate')
        .send({})
        .expect(HttpStatus.BAD_REQUEST);

      // Verify all required fields are present
      expect(response.body).toHaveProperty('statusCode');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('path');

      // Verify timestamp format (ISO 8601)
      expect(response.body.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it('should include correct path in error response', async () => {
      const response = await request(app.getHttpServer())
        .get('/test/error')
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);

      expect(response.body.path).toBe('/test/error');
    });
  });

  describe('HTTP Methods', () => {
    it('should handle errors for GET requests', async () => {
      await request(app.getHttpServer())
        .get('/test/error')
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('should handle errors for POST requests', async () => {
      await request(app.getHttpServer())
        .post('/test/validate')
        .send({})
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should handle errors for PUT requests', async () => {
      await request(app.getHttpServer())
        .put('/non-existent')
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should handle errors for DELETE requests', async () => {
      await request(app.getHttpServer())
        .delete('/non-existent')
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should handle errors for PATCH requests', async () => {
      await request(app.getHttpServer())
        .patch('/non-existent')
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
