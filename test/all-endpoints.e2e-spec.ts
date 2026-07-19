import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdtempSync, rmSync } from 'fs';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { UserRoleEnum } from '../src/database/schemas/user-role.schema';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface RegisteredRoute {
  method: HttpMethod;
  path: string;
}

const OBJECT_ID = '507f1f77bcf86cd799439011';

function concretePath(routePath: string): string {
  return routePath.replace(/:([A-Za-z0-9_]+)/g, (_match, parameter: string) => {
    if (parameter.toLowerCase().includes('date')) return '2026-07-19';
    if (parameter === 'index' || parameter.toLowerCase().endsWith('index')) return '0';
    if (parameter.toLowerCase().includes('category')) return 'hematology';
    if (parameter.toLowerCase().includes('role')) return 'doctor';
    if (parameter.toLowerCase().includes('code')) return 'TEST';
    if (parameter.toLowerCase().includes('key')) return 'test-key';
    return OBJECT_ID;
  });
}

function registeredRoutes(app: INestApplication): RegisteredRoute[] {
  const instance: any = app.getHttpAdapter().getInstance();
  const stack: any[] = instance.router?.stack || instance._router?.stack || [];
  return stack
    .filter((layer) => layer.route?.path && layer.route?.methods)
    .flatMap((layer) => Object.keys(layer.route.methods)
      .filter((method): method is HttpMethod => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
      .map((method) => ({ method, path: layer.route.path as string })))
    .sort((a, b) => `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`));
}

describe('All API endpoints (route and authentication contract)', () => {
  let app: INestApplication;
  let mongo: MongoMemoryReplSet;
  let accessToken: string;
  let backupDir: string;
  const roleTokens = new Map<UserRoleEnum, string>();

  beforeAll(async () => {
    jest.setTimeout(240_000);
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ launchTimeout: 60_000 }],
    });
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = mongo.getUri('emr_endpoint_contract');
    process.env.JWT_SECRET = 'endpoint-contract-test-secret-at-least-32-characters';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    backupDir = mkdtempSync(join(tmpdir(), 'emr-endpoint-backups-'));
    process.env.BACKUP_DIR = backupDir;

    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    await app.init();

    const connection = app.get<Connection>(getConnectionToken());
    const userId = new Types.ObjectId();
    const branchId = new Types.ObjectId();
    await connection.collection('profiles').insertOne({
      _id: userId,
      email: 'endpoint-suite@emr.test',
      passwordHash: 'not-used-by-the-suite',
      fullName: 'Endpoint Test User',
      branchId,
      isActive: true,
    });
    await connection.collection('user_roles').insertMany(
      Object.values(UserRoleEnum).map((role) => ({ userId, role })),
    );
    accessToken = app.get(JwtService).sign(
      { sub: userId.toHexString(), email: 'endpoint-suite@emr.test', branchId: branchId.toHexString() },
      { expiresIn: '15m' },
    );

    for (const role of Object.values(UserRoleEnum)) {
      const roleUserId = new Types.ObjectId();
      const email = `${role}@endpoint-suite.emr.test`;
      await connection.collection('profiles').insertOne({
        _id: roleUserId,
        email,
        passwordHash: 'not-used-by-the-suite',
        fullName: `${role} Endpoint Test User`,
        branchId,
        isActive: true,
      });
      await connection.collection('user_roles').insertOne({ userId: roleUserId, role });
      roleTokens.set(role, app.get(JwtService).sign(
        { sub: roleUserId.toHexString(), email, branchId: branchId.toHexString() },
        { expiresIn: '15m' },
      ));
    }
  }, 240_000);

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
    if (backupDir?.startsWith(tmpdir())) {
      rmSync(backupDir, { recursive: true, force: true });
    }
  });

  it('registers the complete controller surface without method/path collisions', () => {
    const routes = registeredRoutes(app);
    const keys = routes.map(({ method, path }) => `${method.toUpperCase()} ${path}`);

    expect(routes).toHaveLength(382);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('exercises every registered endpoint and never reaches protected handlers anonymously', async () => {
    const routes = registeredRoutes(app);

    for (const route of routes) {
      const path = concretePath(route.path);
      const response = await request(app.getHttpServer())[route.method](path).send({});
      const isPublicRoute =
        (route.method === 'get' && ['/', '/health'].includes(route.path)) ||
        (route.method === 'post' && ['/auth/login', '/auth/refresh'].includes(route.path));

      if (isPublicRoute) {
        expect(response.status).toBeLessThan(500);
      } else {
        expect(response.status).toBe(401);
      }
    }
  }, 120_000);

  it('exercises every registered endpoint as an authenticated multi-role user without server errors', async () => {
    const routes = registeredRoutes(app);
    const failures: string[] = [];

    for (const route of routes) {
      const path = concretePath(route.path);
      const response = await request(app.getHttpServer())[route.method](path)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      if (response.status >= 500) {
        failures.push(`${route.method.toUpperCase()} ${route.path} -> ${response.status}: ${JSON.stringify(response.body)}`);
      }
    }

    failures.forEach((failure) => process.stdout.write(`ENDPOINT_FAILURE ${failure}\n`));
    expect(failures).toEqual([]);
  }, 180_000);

  it('exercises the complete endpoint surface for every individual role without auth or server failures', async () => {
    const routes = registeredRoutes(app);
    const failures: string[] = [];

    for (const [role, token] of roleTokens) {
      for (const route of routes) {
        const response = await request(app.getHttpServer())[route.method](concretePath(route.path))
          .set('Authorization', `Bearer ${token}`)
          .send({});

        if (response.status === 401 || response.status >= 500) {
          failures.push(`${role}: ${route.method.toUpperCase()} ${route.path} -> ${response.status}`);
        }
      }
    }

    failures.forEach((failure) => process.stdout.write(`ROLE_ENDPOINT_FAILURE ${failure}\n`));
    expect(failures).toEqual([]);
  }, 300_000);
});
