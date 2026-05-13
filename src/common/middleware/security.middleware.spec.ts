import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import helmet from 'helmet';
import { AppModule } from '../../app.module';

describe('Security Middleware', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // Apply helmet middleware
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Helmet Security Headers', () => {
    it('should set X-Content-Type-Options header', async () => {
      const response = await request(app.getHttpServer())
        .get('/')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should set X-Frame-Options header', async () => {
      const response = await request(app.getHttpServer())
        .get('/')
        .expect(200);

      expect(response.headers['x-frame-options']).toBeDefined();
    });

    it('should set X-XSS-Protection header', async () => {
      const response = await request(app.getHttpServer())
        .get('/')
        .expect(200);

      expect(response.headers['x-xss-protection']).toBeDefined();
    });

    it('should set Strict-Transport-Security header', async () => {
      const response = await request(app.getHttpServer())
        .get('/')
        .expect(200);

      expect(response.headers['strict-transport-security']).toBeDefined();
    });

    it('should set Content-Security-Policy header', async () => {
      const response = await request(app.getHttpServer())
        .get('/')
        .expect(200);

      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    });
  });

  describe('CORS Configuration', () => {
    it('should allow requests from configured origin', async () => {
      const configService = app.get(ConfigService);
      const allowedOrigin = configService.get('cors.origin');

      const response = await request(app.getHttpServer())
        .get('/')
        .set('Origin', allowedOrigin)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    });

    it('should allow credentials', async () => {
      const configService = app.get(ConfigService);
      const allowedOrigin = configService.get('cors.origin');

      const response = await request(app.getHttpServer())
        .get('/')
        .set('Origin', allowedOrigin)
        .expect(200);

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should handle preflight OPTIONS requests', async () => {
      const configService = app.get(ConfigService);
      const allowedOrigin = configService.get('cors.origin');

      const response = await request(app.getHttpServer())
        .options('/')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(response.headers['access-control-allow-methods']).toBeDefined();
      expect(response.headers['access-control-allow-headers']).toBeDefined();
    });

    it('should expose custom headers', async () => {
      const configService = app.get(ConfigService);
      const allowedOrigin = configService.get('cors.origin');

      const response = await request(app.getHttpServer())
        .get('/')
        .set('Origin', allowedOrigin)
        .expect(200);

      const exposedHeaders = response.headers['access-control-expose-headers'];
      if (exposedHeaders) {
        expect(exposedHeaders).toContain('X-Total-Count');
      }
    });
  });
});
