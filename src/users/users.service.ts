import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Profile } from '../database/schemas/profile.schema';
import { UserRole, UserRoleEnum } from '../database/schemas/user-role.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';

export interface UserResponse {
  id: string;
  email: string;
  fullName: string;
  department?: string;
  avatarUrl?: string;
  roles: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly SALT_ROUNDS = 10;

  constructor(
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(UserRole.name) private userRoleModel: Model<UserRole>,
  ) {}

  /**
   * Hash a password using bcrypt
   */
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * Format user response with roles
   */
  private async formatUserResponse(profile: Profile): Promise<UserResponse> {
    const userRoles = await this.userRoleModel.find({ userId: profile._id }).exec();
    const roles = userRoles.map((ur) => ur.role);

    return {
      id: profile._id.toString(),
      email: profile.email,
      fullName: profile.fullName,
      department: profile.department,
      avatarUrl: profile.avatarUrl,
      roles,
      isActive: profile.isActive,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  /**
   * Create a new user
   * Requirements: 17.1, 17.6
   */
  async create(createUserDto: CreateUserDto): Promise<UserResponse> {
    try {
      // Check if user with email already exists
      const existingUser = await this.profileModel.findOne({ email: createUserDto.email }).exec();
      if (existingUser) {
        throw new ConflictException(`User with email ${createUserDto.email} already exists`);
      }

      // Hash password before storing
      const passwordHash = await this.hashPassword(createUserDto.password);

      // Create user profile
      const profile = new this.profileModel({
        email: createUserDto.email,
        passwordHash,
        fullName: createUserDto.fullName,
        department: createUserDto.department,
        isActive: true,
      });

      await profile.save();

      this.logger.log(`User created successfully: ${profile.email}`);

      return this.formatUserResponse(profile);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error creating user: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Find all users with pagination
   * Requirements: 17.1
   */
  async findAll(page: number = 1, limit: number = 10): Promise<{ users: UserResponse[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = (page - 1) * limit;
      
      const [profiles, total] = await Promise.all([
        this.profileModel.find().skip(skip).limit(limit).exec(),
        this.profileModel.countDocuments().exec(),
      ]);

      const users = await Promise.all(
        profiles.map((profile) => this.formatUserResponse(profile))
      );

      const totalPages = Math.ceil(total / limit);

      return {
        users,
        total,
        page,
        totalPages,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error finding users: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Find user by ID
   * Requirements: 17.1
   */
  async findOne(id: string): Promise<UserResponse> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('Invalid user ID format');
      }

      const profile = await this.profileModel.findById(id).exec();
      
      if (!profile) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      return this.formatUserResponse(profile);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error finding user: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Update user profile
   * Requirements: 17.2
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponse> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('Invalid user ID format');
      }

      const profile = await this.profileModel.findById(id).exec();
      
      if (!profile) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      // Update fields
      if (updateUserDto.fullName !== undefined) {
        profile.fullName = updateUserDto.fullName;
      }
      if (updateUserDto.department !== undefined) {
        profile.department = updateUserDto.department;
      }
      if (updateUserDto.avatarUrl !== undefined) {
        profile.avatarUrl = updateUserDto.avatarUrl;
      }

      await profile.save();

      this.logger.log(`User updated successfully: ${profile.email}`);

      return this.formatUserResponse(profile);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error updating user: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Update user password
   * Requirements: 17.6
   */
  async updatePassword(id: string, newPassword: string): Promise<void> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('Invalid user ID format');
      }

      const profile = await this.profileModel.findById(id).exec();
      
      if (!profile) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      // Hash new password before storing
      profile.passwordHash = await this.hashPassword(newPassword);
      await profile.save();

      this.logger.log(`Password updated for user: ${profile.email}`);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error updating password: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Delete user (soft delete by setting isActive to false)
   * Requirements: 17.1
   */
  async remove(id: string): Promise<void> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('Invalid user ID format');
      }

      const profile = await this.profileModel.findById(id).exec();
      
      if (!profile) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      // Soft delete
      profile.isActive = false;
      await profile.save();

      this.logger.log(`User deactivated: ${profile.email}`);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error removing user: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Assign role to user
   * Requirements: 17.3
   */
  async assignRole(userId: string, role: UserRoleEnum, requestingUserId: string): Promise<UserResponse> {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        throw new BadRequestException('Invalid user ID format');
      }

      // Prevent self-role modification
      if (userId === requestingUserId) {
        throw new ForbiddenException('Users cannot modify their own roles');
      }

      const profile = await this.profileModel.findById(userId).exec();
      
      if (!profile) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Check if role already exists
      const existingRole = await this.userRoleModel.findOne({
        userId: profile._id,
        role,
      }).exec();

      if (existingRole) {
        throw new ConflictException(`User already has role: ${role}`);
      }

      // Create new role
      const userRole = new this.userRoleModel({
        userId: profile._id,
        role,
      });

      await userRole.save();

      this.logger.log(`Role ${role} assigned to user: ${profile.email}`);

      return this.formatUserResponse(profile);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error assigning role: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Remove role from user
   * Requirements: 17.3, 17.4
   */
  async removeRole(userId: string, role: UserRoleEnum, requestingUserId: string): Promise<UserResponse> {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        throw new BadRequestException('Invalid user ID format');
      }

      // Prevent self-role modification
      if (userId === requestingUserId) {
        throw new ForbiddenException('Users cannot modify their own roles');
      }

      const profile = await this.profileModel.findById(userId).exec();
      
      if (!profile) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Find and remove role
      const result = await this.userRoleModel.deleteOne({
        userId: profile._id,
        role,
      }).exec();

      if (result.deletedCount === 0) {
        throw new NotFoundException(`User does not have role: ${role}`);
      }

      this.logger.log(`Role ${role} removed from user: ${profile.email}`);

      return this.formatUserResponse(profile);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error removing role: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Get user roles
   */
  async getUserRoles(userId: string): Promise<string[]> {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        throw new BadRequestException('Invalid user ID format');
      }

      const userRoles = await this.userRoleModel.find({ userId: new Types.ObjectId(userId) }).exec();
      return userRoles.map((ur) => ur.role);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error getting user roles: ${errorMessage}`, errorStack);
      throw error;
    }
  }
}
