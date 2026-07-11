import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { AuthService, AuthResponse } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from './decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { RolesGuard } from '../common/guards/roles.guard';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    userId: string;
    email: string;
    roles: string[];
    branchId?: string;
  };
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<AuthResponse> {
    this.logger.log(`Login attempt for email: ${loginDto.email}`);

    try {
      const result = await this.authService.login(loginDto.email, loginDto.password);
      this.logger.log(`Login successful for email: ${loginDto.email}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Login failed for email: ${loginDto.email} - ${errorMessage}`);
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req: AuthenticatedRequest): Promise<{ message: string }> {
    const userId = req.user.userId;
    this.logger.log(`Logout request for user: ${userId}`);

    await this.authService.logout(userId);

    return { message: 'Logged out successfully' };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshTokenDto: RefreshTokenDto): Promise<{ accessToken: string; user?: { id: string; email: string; fullName: string; roles: string[]; doctorId?: string } }> {
    this.logger.log('Token refresh request received');

    try {
      const result = await this.authService.refreshAccessToken(refreshTokenDto.refreshToken);
      this.logger.log('Token refresh successful');
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Token refresh failed: ${errorMessage}`);
      throw error;
    }
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req: AuthenticatedRequest): Promise<{ id: string; email: string; fullName: string; department?: string; avatarUrl?: string; roles: string[]; createdAt: Date }> {
    const userId = req.user.userId;
    this.logger.log(`Profile request for user: ${userId}`);

    return this.authService.getProfile(userId);
  }

  @Post('select-branch')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async selectBranch(
    @Request() req: AuthenticatedRequest,
    @Body('branchId') branchId: string,
  ): Promise<AuthResponse> {
    const userId = req.user.userId;
    this.logger.log(`Branch selection for user: ${userId}, branch: ${branchId}`);
    return this.authService.selectBranch(userId, branchId);
  }

  @Get('branches')
  @UseGuards(JwtAuthGuard)
  async getBranches(@Request() req: AuthenticatedRequest) {
    return this.authService.getUserBranches(req.user.userId);
  }

  @Post('enter-doctor-mode')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.OK)
  async enterDoctorMode(
    @Request() req: AuthenticatedRequest,
    @Body('branchId') branchId: string,
  ): Promise<AuthResponse> {
    const userId = req.user.userId;
    this.logger.log(`Doctor mode entry for user: ${userId}, branch: ${branchId}`);
    return this.authService.enterDoctorMode(userId, branchId);
  }

  @Post('exit-doctor-mode')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.OK)
  async exitDoctorMode(
    @Request() req: AuthenticatedRequest,
  ): Promise<AuthResponse> {
    const userId = req.user.userId;
    this.logger.log(`Doctor mode exit for user: ${userId}`);
    return this.authService.exitDoctorMode(userId, req.user.branchId);
  }
}
