import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Create a new user (admin only)
   * POST /users
   * Requirements: 17.1
   */
  @Post()
  @Roles(UserRoleEnum.ADMIN)
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  /**
   * Get all users with pagination (admin only)
   * GET /users?page=1&limit=10
   * Requirements: 17.1
   */
  @Get()
  @Roles(UserRoleEnum.ADMIN)
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.usersService.findAll(pageNum, limitNum);
  }

  /**
   * Get user by ID
   * GET /users/:id
   * Requirements: 17.1
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  /**
   * Update user profile
   * PATCH /users/:id
   * Requirements: 17.2
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  /**
   * Delete user (admin only)
   * DELETE /users/:id
   * Requirements: 17.1
   */
  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
  }

  /**
   * Assign role to user (admin only)
   * POST /users/:id/roles
   * Requirements: 17.3, 17.4
   */
  @Post(':id/roles')
  @Roles(UserRoleEnum.ADMIN)
  async assignRole(
    @Param('id') userId: string,
    @Body('role') role: UserRoleEnum,
    @Request() req: any,
  ) {
    const requestingUserId = req.user.userId;
    return this.usersService.assignRole(userId, role, requestingUserId);
  }

  /**
   * Remove role from user (admin only)
   * DELETE /users/:id/roles/:role
   * Requirements: 17.3, 17.4
   */
  @Delete(':id/roles/:role')
  @Roles(UserRoleEnum.ADMIN)
  async removeRole(
    @Param('id') userId: string,
    @Param('role') role: UserRoleEnum,
    @Request() req: any,
  ) {
    const requestingUserId = req.user.userId;
    return this.usersService.removeRole(userId, role, requestingUserId);
  }
}
