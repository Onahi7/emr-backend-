import { Controller, Get, Post, Patch, Param, Body, Request, UseGuards } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto, BatchCreateUsersDto, ProvisionCafBranchDto } from './dto/branch.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchesController {
  constructor(private readonly service: BranchesService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN)
  async create(@Body() dto: CreateBranchDto) {
    return this.service.create(dto);
  }

  @Get()
  async findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.service.update(id, dto);
  }

  @Get(':id/config')
  @Roles(UserRoleEnum.ADMIN)
  async getConfig(@Param('id') id: string) {
    return this.service.getBranchConfig(id);
  }

  @Post(':id/batch-create-users')
  @Roles(UserRoleEnum.ADMIN)
  async batchCreateUsers(@Param('id') id: string, @Body() dto: BatchCreateUsersDto, @Request() req: any) {
    return this.service.batchCreateUsers(id, dto, req.user?.userId);
  }

  @Post(':id/test-caf')
  @Roles(UserRoleEnum.ADMIN)
  async testCaf(@Param('id') id: string) {
    return this.service.testCafConfig(id);
  }

  @Post(':id/test-lis')
  @Roles(UserRoleEnum.ADMIN)
  async testLis(@Param('id') id: string) {
    return this.service.testLisConfig(id);
  }

  @Post(':id/provision-caf')
  @Roles(UserRoleEnum.ADMIN)
  async provisionCaf(@Param('id') id: string, @Body() dto: ProvisionCafBranchDto) {
    return this.service.provisionCafBranch(id, dto);
  }
}
