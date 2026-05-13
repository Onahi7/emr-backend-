import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression');
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters';
import { LoggingInterceptor, AuditLoggingInterceptor } from './common/interceptors';
import { startLanDiscovery } from './lan-discovery';

async function bootstrap() {
  // Create NestJS application with custom logger configuration
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Enable gzip/brotli compression — critical for slow/unstable networks
  app.use(compression());

  // Enable security headers with Helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow embedding for development
  }));

  // Enable CORS — accept Electron (file://) and LAN connections
  const corsOrigin = configService.get('cors.origin');
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (Electron file://, mobile apps, curl)
      if (!origin) return callback(null, true);
      
      // Allow configured origin (e.g. http://localhost:5173)
      if (origin === corsOrigin) return callback(null, true);
      
      // Allow any localhost/127.0.0.1 with any port (for development)
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      
      // Allow any LAN origin (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
      if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      
      // Allow Cloudflare Workers domains (*.workers.dev)
      if (/^https:\/\/[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.workers\.dev$/.test(origin)) {
        return callback(null, true);
      }
      
      // Allow Cloudflare Pages domains (*.pages.dev)
      if (/^https:\/\/[a-zA-Z0-9-]+\.pages\.dev$/.test(origin)) {
        return callback(null, true);
      }
      
      callback(null, false);
    },
    credentials: configService.get('cors.credentials'),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
    maxAge: 3600,
  });
  logger.log(`CORS enabled for origin: ${corsOrigin} + localhost (all ports) + LAN + Cloudflare`);

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Enable global exception filter
  app.useGlobalFilters(new HttpExceptionFilter(configService));

  // Enable global interceptors for logging and monitoring
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new AuditLoggingInterceptor(),
  );

  const port = configService.get('app.port');
  
  // Listen on all network interfaces (0.0.0.0) for LAN access
  await app.listen(port, '0.0.0.0');

  // Start LAN discovery responder so Electron clients can find this backend
  startLanDiscovery(port);

  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`LAN access available at: http://[YOUR_LAN_IP]:${port}`);
  logger.log(`Find your LAN IP with: ipconfig (Windows) or ifconfig (Mac/Linux)`);
  logger.log(`Environment: ${configService.get('app.nodeEnv')}`);
  logger.log('Logging and monitoring interceptors enabled');
}
void bootstrap();
