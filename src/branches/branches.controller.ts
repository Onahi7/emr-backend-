import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
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
}
