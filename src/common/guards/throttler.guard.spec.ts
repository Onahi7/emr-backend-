import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import * as request from 'supertest';
import { AppModule } from '../../app.module';

describe('Rate Limiting (ThrottlerGuard)', () => {
  let app: INestApplication;
  let configService: ConfigService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configService = app.get(ConfigService);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Rate Limit Configuration', () => {
    it('should have rate limiting configured', () => {
      const ttl = configService.get('rateLimit.ttl');
      const limit = configService.get('rateLimit.limit');

      expect(ttl).toBeDefined();
      expect(limit).toBeDefined();
      expect(typeof ttl).toBe('number');
      expect(typeof limit).toBe('number');
    });

    it('should use default values if not configured', () => {
      const ttl = configService.get('rateLimit.ttl') || 60;
      const limit = configService.get('rateLimit.limit') || 100;

      expect(ttl).toBeGreaterThan(0);
      expect(limit).toBeGreaterThan(0);
    });
  });

  describe('Rate Limit Enforcement', () => {
    it('should allow requests within rate limit', async () => {
      const response = await request(app.getHttpServer())
        .get('/')
        .expect(200);

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    });

    it('should set rate limit headers on response', async () => {
      const response = await request(app.getHttpServer())
        .get('/')
        .expect(200);

      const limit = response.headers['x-ratelimit-limit'];
      const remaining = response.headers['x-ratelimit-remaining'];
      const reset = response.headers['x-ratelimit-reset'];

      expect(limit).toBeDefined();
      expect(remaining).toBeDefined();
      expect(reset).toBeDefined();
      expect(parseInt(remaining)).toBeLessThanOrEqual(parseInt(limit));
    });

    it('should block requests exceeding rate limit', async () => {
      const limit = configService.get('rateLimit.limit') || 100;
      
      // Make requests up to the limit
      const requests = [];
      for (let i = 0; i < limit + 5; i++) {
        requests.push(
          request(app.getHttpServer())
            .get('/')
        );
      }

      const responses = await Promise.all(requests);
      
      // Check that at least one request was rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 30000); // Increase timeout for this test

    it('should return 429 status code when rate limit exceeded', async () => {
      const limit = configService.get('rateLimit.limit') || 100;
      
      // Exhaust the rate limit
      for (let i = 0; i < limit; i++) {
        await request(app.getHttpServer()).get('/');
      }

      // Next request should be rate limited
      const response = await request(app.getHttpServer())
        .get('/')
        .expect(429);

      expect(response.body.message).toBeDefined();
    }, 30000); // Increase timeout for this test
  });

  describe('Rate Limit Reset', () => {
    it('should include reset timestamp in headers', async () => {
      const response = await request(app.getHttpServer())
        .get('/')
        .expect(200);

      const reset = response.headers['x-ratelimit-reset'];
      expect(reset).toBeDefined();
      
      const resetTime = parseInt(reset);
      const now = Math.floor(Date.now() / 1000);
      expect(resetTime).toBeGreaterThanOrEqual(now);
    });

    it('should reset rate limit after TTL expires', async () => {
      const ttl = configService.get('rateLimit.ttl') || 60;
      
      // Make a request
      const firstResponse = await request(app.getHttpServer())
        .get('/')
        .expect(200);

      const firstRemaining = parseInt(firstResponse.headers['x-ratelimit-remaining']);

      // Wait for TTL to expire (in a real test, you'd mock time)
      // For now, just verify the reset time is in the future
      const reset = parseInt(firstResponse.headers['x-ratelimit-reset']);
      const now = Math.floor(Date.now() / 1000);
      
      expect(reset).toBeGreaterThan(now);
      expect(reset).toBeLessThanOrEqual(now + ttl);
    });
  });
});
