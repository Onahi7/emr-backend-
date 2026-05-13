import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { Profile } from '../database/schemas/profile.schema';
import { UserRole, UserRoleEnum } from '../database/schemas/user-role.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

describe('UsersService', () => {
  let service: UsersService;
  let profileModel: Model<Profile>;
  let userRoleModel: Model<UserRole>;

  const mockProfile = {
    _id: new Types.ObjectId(),
    email: 'test@example.com',
    passwordHash: '$2b$10$hashedpassword',
    fullName: 'Test User',
    department: 'IT',
    avatarUrl: 'https://example.com/avatar.jpg',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    save: jest.fn().mockResolvedValue(this),
  };

  const mockUserRole = {
    _id: new Types.ObjectId(),
    userId: mockProfile._id,
    role: UserRoleEnum.ADMIN,
    createdAt: new Date(),
    save: jest.fn().mockResolvedValue(this),
  };

  const mockProfileModel = {
    new: jest.fn().mockResolvedValue(mockProfile),
    constructor: jest.fn().mockResolvedValue(mockProfile),
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
    exec: jest.fn(),
  };

  const mockUserRoleModel = {
    new: jest.fn().mockResolvedValue(mockUserRole),
    constructor: jest.fn().mockResolvedValue(mockUserRole),
    find: jest.fn(),
    findOne: jest.fn(),
    deleteOne: jest.fn(),
    create: jest.fn(),
    exec: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(Profile.name),
          useValue: mockProfileModel,
        },
        {
          provide: getModelToken(UserRole.name),
          useValue: mockUserRoleModel,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    profileModel = module.get<Model<Profile>>(getModelToken(Profile.name));
    userRoleModel = module.get<Model<UserRole>>(getModelToken(UserRole.name));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createUserDto: CreateUserDto = {
      email: 'newuser@example.com',
      password: 'Password123!',
      fullName: 'New User',
      department: 'HR',
    };

    it('should throw ConflictException if email already exists', async () => {
      mockProfileModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockProfile),
      });

      await expect(service.create(createUserDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      const profiles = [mockProfile];
      mockProfileModel.find.mockReturnValue({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(profiles),
      });
      mockProfileModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });
      mockUserRoleModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockUserRole]),
      });

      const result = await service.findAll(1, 10);

      expect(result.users).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return a user by ID', async () => {
      mockProfileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockProfile),
      });
      mockUserRoleModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockUserRole]),
      });

      const result = await service.findOne(mockProfile._id.toString());

      expect(result.id).toBe(mockProfile._id.toString());
      expect(result.email).toBe(mockProfile.email);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockProfileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.findOne(new Types.ObjectId().toString())).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid ID format', async () => {
      await expect(service.findOne('invalid-id')).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    const updateUserDto: UpdateUserDto = {
      fullName: 'Updated Name',
      department: 'Engineering',
    };

    it('should update user profile', async () => {
      const updatedProfile = {
        ...mockProfile,
        fullName: updateUserDto.fullName,
        department: updateUserDto.department,
        save: jest.fn().mockResolvedValue(this),
      };

      mockProfileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedProfile),
      });
      mockUserRoleModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockUserRole]),
      });

      const result = await service.update(mockProfile._id.toString(), updateUserDto);

      expect(result.fullName).toBe(updateUserDto.fullName);
      expect(result.department).toBe(updateUserDto.department);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockProfileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.update(new Types.ObjectId().toString(), updateUserDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft delete user by setting isActive to false', async () => {
      const profile = {
        ...mockProfile,
        isActive: true,
        save: jest.fn().mockResolvedValue(this),
      };

      mockProfileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(profile),
      });

      await service.remove(mockProfile._id.toString());

      expect(profile.isActive).toBe(false);
      expect(profile.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      mockProfileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.remove(new Types.ObjectId().toString())).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignRole', () => {
    const userId = new Types.ObjectId().toString();
    const requestingUserId = new Types.ObjectId().toString();

    it('should throw ForbiddenException if user tries to modify own roles', async () => {
      const sameUserId = userId;

      await expect(service.assignRole(sameUserId, UserRoleEnum.ADMIN, sameUserId)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if role already exists', async () => {
      mockProfileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockProfile),
      });
      mockUserRoleModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUserRole),
      });

      await expect(service.assignRole(userId, UserRoleEnum.ADMIN, requestingUserId)).rejects.toThrow(ConflictException);
    });
  });

  describe('removeRole', () => {
    const userId = new Types.ObjectId().toString();
    const requestingUserId = new Types.ObjectId().toString();

    it('should remove role from user', async () => {
      mockProfileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockProfile),
      });
      mockUserRoleModel.deleteOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      });
      mockUserRoleModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      const result = await service.removeRole(userId, UserRoleEnum.ADMIN, requestingUserId);

      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException if user tries to modify own roles', async () => {
      const sameUserId = userId;

      await expect(service.removeRole(sameUserId, UserRoleEnum.ADMIN, sameUserId)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if role does not exist', async () => {
      mockProfileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockProfile),
      });
      mockUserRoleModel.deleteOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      });

      await expect(service.removeRole(userId, UserRoleEnum.ADMIN, requestingUserId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePassword', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockProfileModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.updatePassword(new Types.ObjectId().toString(), 'NewPassword123!')).rejects.toThrow(NotFoundException);
    });
  });
});
