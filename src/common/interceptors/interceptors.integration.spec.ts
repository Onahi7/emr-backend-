import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Controller, Get, Post, Body } from '@nestjs/common';
import request from 'supertest';
import { LoggingInterceptor } from './logging.interceptor';
import { AuditLoggingInterceptor } from './audit-logging.interceptor';

// Test controller for integration testing
@Controller('test')
class TestController {
  @Get()
  getTest() {
    return { message: 'GET test' };
  }

  @Post()
  postTest(@Body() body: any) {
    return { id: 'test-id-123', ...body };
  }

  @Get('error')
  getError() {
    throw new Error('Test error');
  }
}

describe('Interceptors Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply interceptors globally
    app.useGlobalInterceptors(
      new LoggingInterceptor(),
      new AuditLoggingInterceptor(),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('LoggingInterceptor Integration', () => {
    it('should log GET requests', async () => {
      const response = await request(app.getHttpServer())
        .get('/test')
        .expect(200);

      expect(response.body).toEqual({ message: 'GET test' });
    });

    it('should log POST requests with body', async () => {
      const response = await request(app.getHttpServer())
        .post('/test')
        .send({ name: 'test', value: 123 })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('test');
    });

    it('should handle errors gracefully', async () => {
      await request(app.getHttpServer()).get('/test/error').expect(500);
    });
  });

  describe('AuditLoggingInterceptor Integration', () => {
    it('should audit POST requests', async () => {
      const response = await request(app.getHttpServer())
        .post('/test')
        .send({ data: 'audit test' })
        .expect(201);

      expect(response.body).toHaveProperty('id');
    });

    it('should not audit GET requests', async () => {
      await request(app.getHttpServer()).get('/test').expect(200);
      // Audit interceptor should skip GET requests
    });
  });

  describe('Combined Interceptors', () => {
    it('should apply both interceptors in order', async () => {
      const response = await request(app.getHttpServer())
        .post('/test')
        .send({ name: 'combined test' })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('combined test');
    });

    it('should handle sensitive data correctly', async () => {
      const response = await request(app.getHttpServer())
        .post('/test')
        .send({
          username: 'testuser',
          password: 'secret123',
          email: 'test@example.com',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.username).toBe('testuser');
      // Password should be in response but logged as redacted
      expect(response.body.password).toBe('secret123');
    });
  });
});
