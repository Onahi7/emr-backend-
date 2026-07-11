import { ForbiddenException, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { Profile } from '../database/schemas/profile.schema';
import { UserRole, UserRoleEnum } from '../database/schemas/user-role.schema';
import { Doctor } from '../database/schemas/doctor.schema';
import { DoctorsService } from '../doctors/doctors.service';

export interface JwtPayload {
  sub: string; // user ID
  email: string;
  roles: string[];
  branchId?: string;
  doctorId?: string; // linked Doctor record _id, when applicable
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
    branchId?: string;
    doctorId?: string;
  };
  requiresBranchSelection?: boolean;
  availableBranches?: Array<{ _id: string; name: string; code: string }>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 10;

  constructor(
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(UserRole.name) private userRoleModel: Model<UserRole>,
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private doctorsService: DoctorsService,
  ) {}

  private async getDoctorIdForUser(userId: string, branchId?: string): Promise<string | undefined> {
    try {
      const query: any = { userId: new Types.ObjectId(userId), isActive: true };
      if (branchId) query.branchId = new Types.ObjectId(branchId);
      const doctor = await this.doctorModel.findOne(query).select('_id').lean().exec();
      return doctor?._id?.toString();
    } catch {
      return undefined;
    }
  }

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
  async validateUser(email: string, password: string): Promise<{ id: string; email: string; fullName: string; roles: string[]; branchId?: string } | null> {
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
        branchId: user.branchId ? user.branchId.toString() : undefined,
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
  async generateAccessToken(user: { id: string; email: string; roles: string[]; doctorId?: string }, branchId?: string): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      branchId,
      doctorId: user.doctorId,
    };

    return this.jwtService.sign(payload);
  }

  /**
   * Generate JWT refresh token
   */
  async generateRefreshToken(user: { id: string; email: string; roles: string[]; doctorId?: string }, branchId?: string): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      branchId,
      doctorId: user.doctorId,
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

    const doctorId = await this.getDoctorIdForUser(user.id, user.branchId?.toString());
    const userWithDoctor = { ...user, doctorId };

    const accessToken = await this.generateAccessToken(userWithDoctor, user.branchId);
    const refreshToken = await this.generateRefreshToken(userWithDoctor, user.branchId);

    this.logger.log(`User logged in successfully: ${email}${doctorId ? ` (doctorId: ${doctorId})` : ''}`);

    return {
      accessToken,
      refreshToken,
      user: userWithDoctor,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; user?: { id: string; email: string; fullName: string; roles: string[]; doctorId?: string } }> {
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

      const doctorId = await this.getDoctorIdForUser(user._id.toString(), user.branchId?.toString());

      const userData = {
        id: user._id.toString(),
        email: user.email,
        fullName: user.fullName,
        roles,
        doctorId,
      };

      // Preserve branchId from the original refresh token, fall back to user's stored branchId
      const branchId = (payload as any).branchId || (user as any).branchId?.toString() || undefined;
      const accessToken = await this.generateAccessToken(userData, branchId);

      this.logger.log(`Access token refreshed for user: ${user.email}${doctorId ? ` (doctorId: ${doctorId})` : ''}`);

      return { accessToken, user: userData };
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
  async getProfile(userId: string): Promise<{ id: string; email: string; fullName: string; department?: string; avatarUrl?: string; roles: string[]; branchId?: string; branch?: { _id: string; name: string; code: string } | null; createdAt: Date }> {
    const user = await this.profileModel.findById(userId).exec();
    
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Get user roles
    const userRoles = await this.userRoleModel.find({ userId: user._id }).exec();
    const roles = userRoles.map((ur) => ur.role);
    const BranchModel = this.profileModel.db.model('Branch');
    const branch: any = user.branchId
      ? await BranchModel.findById(user.branchId).select('name code').lean().exec()
      : null;

    return {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      department: user.department,
      avatarUrl: user.avatarUrl,
      roles,
      branchId: user.branchId?.toString(),
      branch: branch ? { _id: branch._id?.toString() || '', name: branch.name || '', code: branch.code || '' } : null,
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

  /**
   * Select a branch and regenerate tokens with branchId
   */
  async selectBranch(userId: string, branchId: string): Promise<AuthResponse> {
    const user = await this.profileModel.findById(userId).exec();
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const userRoles = await this.userRoleModel.find({ userId: user._id }).exec();
    const roles = userRoles.map((ur) => ur.role);
    const isAdmin = roles.includes(UserRoleEnum.ADMIN);
    const assignedBranchId = user.branchId?.toString();

    if (!isAdmin && assignedBranchId !== branchId) {
      throw new ForbiddenException('You are not assigned to this branch');
    }

    const doctorId = await this.getDoctorIdForUser(user._id.toString(), branchId);

    const userObj = {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      roles,
      doctorId,
    };

    const accessToken = await this.generateAccessToken(userObj, branchId);
    const refreshToken = await this.generateRefreshToken(userObj, branchId);

    this.logger.log(`User ${user.email} selected branch ${branchId}${doctorId ? ` (doctorId: ${doctorId})` : ''}`);

    return {
      accessToken,
      refreshToken,
      user: { ...userObj, branchId },
    };
  }

  /**
   * Enter doctor mode: find/create an Admin Doctor record for the branch,
   * then generate a new JWT with that doctorId.
   */
  async enterDoctorMode(userId: string, branchId: string): Promise<AuthResponse> {
    const user = await this.profileModel.findById(userId).exec();
    if (!user) throw new UnauthorizedException('User not found');

    const userRoles = await this.userRoleModel.find({ userId: user._id }).exec();
    const roles = userRoles.map((ur) => ur.role);
    if (!roles.includes(UserRoleEnum.ADMIN)) {
      throw new ForbiddenException('Only admins can enter doctor mode');
    }

    const adminDoctor = await this.doctorsService.findOrCreateAdminDoctor(branchId);

    const userObj = {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      roles,
      doctorId: adminDoctor._id.toString(),
    };

    const accessToken = await this.generateAccessToken(userObj, branchId);
    const refreshToken = await this.generateRefreshToken(userObj, branchId);

    this.logger.log(`Admin ${user.email} entered doctor mode (doctorId: ${adminDoctor._id}, branch: ${branchId})`);

    return {
      accessToken,
      refreshToken,
      user: { ...userObj, branchId },
    };
  }

  /**
   * Exit doctor mode: re-generate JWT without doctorId.
   */
  async exitDoctorMode(userId: string, currentBranchId?: string): Promise<AuthResponse> {
    const user = await this.profileModel.findById(userId).exec();
    if (!user) throw new UnauthorizedException('User not found');

    const userRoles = await this.userRoleModel.find({ userId: user._id }).exec();
    const roles = userRoles.map((ur) => ur.role);

    const branchId = currentBranchId || user.branchId?.toString() || undefined;

    const userObj = {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      roles,
      doctorId: undefined as string | undefined,
    };

    const accessToken = await this.generateAccessToken(userObj, branchId);
    const refreshToken = await this.generateRefreshToken(userObj, branchId);

    this.logger.log(`Admin ${user.email} exited doctor mode`);

    return {
      accessToken,
      refreshToken,
      user: { ...userObj, branchId },
    };
  }

  /**
   * Get available branches for a user
   */
  async getUserBranches(userId: string): Promise<Array<{ _id: string; name: string; code: string }>> {
    const user = await this.profileModel.findById(userId).exec();
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const userRoles = await this.userRoleModel.find({ userId: user._id }).exec();
    const roles = userRoles.map((ur) => ur.role);
    const BranchModel = this.profileModel.db.model('Branch');
    const query: any = { isActive: true };
    if (!roles.includes(UserRoleEnum.ADMIN)) {
      if (!user.branchId) return [];
      query._id = user.branchId;
    }
    const branches = await BranchModel.find(query).select('name code').lean().exec();
    return branches.map((b: any) => ({ _id: b._id?.toString() || '', name: b.name || '', code: b.code || '' }));
  }
}
