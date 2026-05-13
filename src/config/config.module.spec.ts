import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from './config.module';

describe('ConfigModule', () => {
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule],
    }).compile();

    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(configService).toBeDefined();
  });

  it('should load application configuration', () => {
    const port = configService.get('app.port');
    expect(port).toBeDefined();
    expect(typeof port).toBe('number');
  });

  it('should load database configuration', () => {
    const dbUri = configService.get('database.uri');
    expect(dbUri).toBeDefined();
    expect(typeof dbUri).toBe('string');
  });

  it('should load JWT configuration', () => {
    const jwtSecret = configService.get('jwt.secret');
    const jwtExpiresIn = configService.get('jwt.expiresIn');
    const jwtRefreshSecret = configService.get('jwt.refreshSecret');
    const jwtRefreshExpiresIn = configService.get('jwt.refreshExpiresIn');

    expect(jwtSecret).toBeDefined();
    expect(jwtExpiresIn).toBeDefined();
    expect(jwtRefreshSecret).toBeDefined();
    expect(jwtRefreshExpiresIn).toBeDefined();
  });

  it('should load CORS configuration', () => {
    const corsOrigin = configService.get('cors.origin');
    const corsCredentials = configService.get('cors.credentials');

    expect(corsOrigin).toBeDefined();
    expect(corsCredentials).toBeDefined();
  });

  it('should load logging configuration', () => {
    const logLevel = configService.get('logging.level');
    expect(logLevel).toBeDefined();
    expect(typeof logLevel).toBe('string');
  });

  it('should load rate limiting configuration', () => {
    const rateLimitTtl = configService.get('rateLimit.ttl');
    const rateLimitMax = configService.get('rateLimit.limit');

    expect(rateLimitTtl).toBeDefined();
    expect(typeof rateLimitTtl).toBe('number');
    expect(rateLimitMax).toBeDefined();
    expect(typeof rateLimitMax).toBe('number');
  });

  it('should provide default values for optional configuration', () => {
    const port = configService.get('app.port', 3000);
    expect(port).toBe(3000);
  });
});
