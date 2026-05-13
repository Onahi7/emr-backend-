import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { Profile } from '../database/schemas/profile.schema';
import { UserRole } from '../database/schemas/user-role.schema';

export interface JwtPayload {
  sub: string; // user ID
  email: string;
  roles: string[];
  iat?: number;
  exp?: number;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    roles: string[];
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 10;

  constructor(
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(UserRole.name) private userRoleModel: Model<UserRole>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * Compare a plain text password with a hashed password
   */
  async comparePasswords(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Validate user credentials
   */
  async validateUser(email: string, password: string): Promise<{ id: string; email: string; fullName: string; roles: string[] } | null> {
    try {
      const user = await this.profileModel.findOne({ email, isActive: true }).exec();
      
      if (!user) {
        this.logger.warn(`Login attempt failed: User not found - ${email}`);
        return null;
      }

      const isPasswordValid = await this.comparePasswords(password, user.passwordHash);
      
      if (!isPasswordValid) {
        this.logger.warn(`Login attempt failed: Invalid password - ${email}`);
        return null;
      }

      // Get user roles
      const userRoles = await this.userRoleModel.find({ userId: user._id }).exec();
      const roles = userRoles.map((ur) => ur.role);

      this.logger.log(`User validated successfully: ${email}`);
      
      return {
        id: user._id.toString(),
        email: user.email,
        fullName: user.fullName,
        roles,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error validating user: ${errorMessage}`, errorStack);
      return null;
    }
  }

  /**
   * Generate JWT access token
   */
  async generateAccessToken(user: { id: string; email: string; roles: string[] }): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
    };

    return this.jwtService.sign(payload);
  }

  /**
   * Generate JWT refresh token
   */
  async generateRefreshToken(user: { id: string; email: string; roles: string[] }): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
    };

    const refreshTokenExpiry = this.configService.get<string>('jwt.refreshTokenExpiry', '7d');

    return this.jwtService.sign(payload, {
      expiresIn: refreshTokenExpiry as `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}`,
    });
  }

  /**
   * Login user and generate tokens
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    const user = await this.validateUser(email, password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user);

    this.logger.log(`User logged in successfully: ${email}`);

    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken) as JwtPayload;

      // Get fresh user data
      const user = await this.profileModel.findById(payload.sub).exec();
      
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Get user roles
      const userRoles = await this.userRoleModel.find({ userId: user._id }).exec();
      const roles = userRoles.map((ur) => ur.role);

      const userData = {
        id: user._id.toString(),
        email: user.email,
        fullName: user.fullName,
        roles,
      };

      const accessToken = await this.generateAccessToken(userData);

      this.logger.log(`Access token refreshed for user: ${user.email}`);

      return { accessToken };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error refreshing token: ${errorMessage}`, errorStack);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Get user profile by ID
   */
  async getProfile(userId: string): Promise<{ id: string; email: string; fullName: string; department?: string; avatarUrl?: string; roles: string[]; createdAt: Date }> {
    const user = await this.profileModel.findById(userId).exec();
    
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Get user roles
    const userRoles = await this.userRoleModel.find({ userId: user._id }).exec();
    const roles = userRoles.map((ur) => ur.role);

    return {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      department: user.department,
      avatarUrl: user.avatarUrl,
      roles,
      createdAt: user.createdAt,
    };
  }

  /**
   * Logout user (client-side token removal)
   */
  async logout(userId: string): Promise<void> {
    this.logger.log(`User logged out: ${userId}`);
    // In a JWT-based system, logout is typically handled client-side by removing tokens
    // If you need server-side token blacklisting, implement it here
  }
}
