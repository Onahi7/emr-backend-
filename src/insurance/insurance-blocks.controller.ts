import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { InsuranceBlocksService } from './insurance-blocks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('insurance-blocks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InsuranceBlocksController {
  constructor(private readonly service: InsuranceBlocksService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  create(@Body() dto: any, @Req() req: any) {
    return this.service.create(dto, req.user?.userId, req.user?.branchId);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  findAll(
    @Query('programCode') programCode?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
    @Req() req?: any,
  ) {
    return this.service.findAll({
      programCode,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search,
      branchId: req.user?.branchId,
    });
  }

  @Get('stats')
  @Roles(UserRoleEnum.ADMIN)
  getStats(@Req() req: any) {
    return this.service.getStats(req.user?.branchId);
  }

  @Get('check')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  checkBlocked(
    @Query('patientId') patientId?: string,
    @Query('memberNumber') memberNumber?: string,
    @Query('programCode') programCode?: string,
    @Req() req?: any,
  ) {
    return this.service.checkBlocked(patientId, memberNumber, programCode, req.user?.branchId);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  findById(@Param('id') id: string, @Req() req: any) {
    return this.service.findById(id, req.user?.branchId);
  }

  @Patch(':id/deactivate')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  deactivate(@Param('id') id: string, @Req() req: any) {
    return this.service.deactivate(id, req.user?.branchId);
  }

  @Patch(':id/reactivate')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  reactivate(@Param('id') id: string, @Req() req: any) {
    return this.service.reactivate(id, req.user?.branchId);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user?.branchId);
  }
}
