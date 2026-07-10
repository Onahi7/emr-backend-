import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { InsuranceBlocksService } from './insurance-blocks.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('insurance-blocks')
@UseGuards(RolesGuard)
export class InsuranceBlocksController {
  constructor(private readonly service: InsuranceBlocksService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  create(@Body() dto: any, @Req() req: any) {
    return this.service.create(dto, req.user?.id);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  findAll(
    @Query('programCode') programCode?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.findAll({
      programCode,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search,
      branchId,
    });
  }

  @Get('stats')
  @Roles(UserRoleEnum.ADMIN)
  getStats() {
    return this.service.getStats();
  }

  @Get('check')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  checkBlocked(
    @Query('patientId') patientId?: string,
    @Query('memberNumber') memberNumber?: string,
    @Query('programCode') programCode?: string,
  ) {
    return this.service.checkBlocked(patientId, memberNumber, programCode);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id/deactivate')
  @Roles(UserRoleEnum.ADMIN)
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }

  @Patch(':id/reactivate')
  @Roles(UserRoleEnum.ADMIN)
  reactivate(@Param('id') id: string) {
    return this.service.reactivate(id);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
