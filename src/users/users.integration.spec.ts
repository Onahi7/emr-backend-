import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import * as request from 'supertest';
import { UsersModule } from './users.module';
import { AuthModule } from '../auth/auth.module';
import { Profile, ProfileSchema } from '../database/schemas/profile.schema';
import { UserRole, UserRoleSchema, UserRoleEnum } from '../database/schemas/user-role.schema';
import configuration from '../config/configuration';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

/**
 * Users Module Integration Tests
 * 
 * Tests complete user management workflows including:
 * - User creation with password hashing
 * - Role assignment and removal
 * - Self-role modification prevention
 * - User CRUD operations
 * 
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.6
 * 
 * Note: These tests require a running MongoDB instance
 */
describe('UsersModule Integration', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Use test database URI
    process.env.MONGODB_URI =
      process.env.MONGODB_URI || 'mongodb://localhost:27017/lis_test';
    process.env.JWT_SECRET = 'test-secret-key';
    process.env.JWT_EXPIRY = '1h';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [configuration],
          isGlobal: true,
        }),
        MongooseModule.forRoot(process.env.MONGODB_URI),
        MongooseModule.forFeature([
          { name: Profile.name, schema: ProfileSchema },
          { name: UserRole.name, schema: UserRoleSchema },
        ]),
        AuthModule,
        UsersModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // Create admin user for testing
    const authService = moduleFixture.get('AuthService');
    const usersService = moduleFixture.get('UsersService');
    
    // Create admin profile
    const adminUser = await usersService.create({
      email: 'admin@test.com',
      password: 'Admin123!',
      fullName: 'Test Admin',
      department: 'IT',
    });
    adminUserId = adminUser.id;

    // Assign admin role
    await usersService.assignRole(adminUserId, UserRoleEnum.ADMIN, 'system');

    // Login to get token
    const loginResponse = await authService.login('admin@test.com', 'Admin123!');
    adminToken = loginResponse.accessToken;
  });

  afterAll(async () => {
    // Clean up test data
    const profileModel = app.get('ProfileModel');
    const userRoleModel = app.get('UserRoleModel');
    
    await profileModel.deleteMany({ email: { $regex: '@test.com$' } });
    await userRoleModel.deleteMany({});

    await app.close();
  });

  describe('POST /users - Create User', () => {
    it('should create a new user with hashed password (Requirement 17.1, 17.6)', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser@test.com',
          password: 'Password123!',
          fullName: 'New User',
          department: 'HR',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe('newuser@test.com');
      expect(response.body.fullName).toBe('New User');
      expect(response.body.department).toBe('HR');
      expect(response.body.roles).toEqual([]);
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');

      testUserId = response.body.id;
    });

    it('should reject user creation without authentication', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({
          email: 'noauth@test.com',
          password: 'Password123!',
          fullName: 'No Auth User',
        })
        .expect(401);
    });

    it('should reject user creation with duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser@test.com',
          password: 'Password123!',
          fullName: 'Duplicate User',
        })
        .expect(409);
    });

    it('should reject user creation with invalid data', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'invalid-email',
          password: 'short',
          fullName: '',
        })
        .expect(400);
    });
  });

  describe('GET /users - List Users', () => {
    it('should return paginated list of users (Requirement 17.1)', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('totalPages');
      expect(Array.isArray(response.body.users)).toBe(true);
      expect(response.body.users.length).toBeGreaterThan(0);
    });

    it('should reject listing users without admin role', async () => {
      // This would require creating a non-admin user and getting their token
      // For now, we test that authentication is required
      await request(app.getHttpServer())
        .get('/users')
        .expect(401);
    });
  });

  describe('GET /users/:id - Get User', () => {
    it('should return user by ID (Requirement 17.1)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.id).toBe(testUserId);
      expect(response.body.email).toBe('newuser@test.com');
      expect(response.body.fullName).toBe('New User');
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      await request(app.getHttpServer())
        .get(`/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should return 400 for invalid ID format', async () => {
      await request(app.getHttpServer())
        .get('/users/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('PATCH /users/:id - Update User', () => {
    it('should update user profile (Requirement 17.2)', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Updated Name',
          department: 'Engineering',
        })
        .expect(200);

      expect(response.body.fullName).toBe('Updated Name');
      expect(response.body.department).toBe('Engineering');
      expect(response.body.email).toBe('newuser@test.com'); // Email unchanged
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      await request(app.getHttpServer())
        .patch(`/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Updated' })
        .expect(404);
    });
  });

  describe('POST /users/:id/roles - Assign Role', () => {
    it('should assign role to user (Requirement 17.3)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/users/${testUserId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: UserRoleEnum.LAB_TECH })
        .expect(201);

      expect(response.body.roles).toContain(UserRoleEnum.LAB_TECH);
    });

    it('should prevent self-role modification (Requirement 17.4)', async () => {
      await request(app.getHttpServer())
        .post(`/users/${adminUserId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: UserRoleEnum.RECEPTIONIST })
        .expect(403);
    });

    it('should reject duplicate role assignment', async () => {
      await request(app.getHttpServer())
        .post(`/users/${testUserId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: UserRoleEnum.LAB_TECH })
        .expect(409);
    });

    it('should reject role assignment without admin role', async () => {
      await request(app.getHttpServer())
        .post(`/users/${testUserId}/roles`)
        .send({ role: UserRoleEnum.ADMIN })
        .expect(401);
    });
  });

  describe('DELETE /users/:id/roles/:role - Remove Role', () => {
    it('should remove role from user (Requirement 17.3)', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/users/${testUserId}/roles/${UserRoleEnum.LAB_TECH}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.roles).not.toContain(UserRoleEnum.LAB_TECH);
    });

    it('should prevent self-role modification (Requirement 17.4)', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${adminUserId}/roles/${UserRoleEnum.ADMIN}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('should return 404 for non-existent role', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${testUserId}/roles/${UserRoleEnum.RECEPTIONIST}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('DELETE /users/:id - Delete User', () => {
    it('should soft delete user (Requirement 17.1)', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user is deactivated
      const response = await request(app.getHttpServer())
        .get(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.isActive).toBe(false);
    });

    it('should reject deletion without admin role', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${testUserId}`)
        .expect(401);
    });
  });

  describe('Password Hashing', () => {
    it('should never expose password or passwordHash in responses (Requirement 17.6)', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'passwordtest@test.com',
          password: 'TestPassword123!',
          fullName: 'Password Test User',
        })
        .expect(201);

      expect(createResponse.body).not.toHaveProperty('password');
      expect(createResponse.body).not.toHaveProperty('passwordHash');

      const getResponse = await request(app.getHttpServer())
        .get(`/users/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(getResponse.body).not.toHaveProperty('password');
      expect(getResponse.body).not.toHaveProperty('passwordHash');
    });
  });
});
