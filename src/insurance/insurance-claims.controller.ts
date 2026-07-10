import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { InsuranceClaimsService } from './insurance-claims.service';
import { CreateInsuranceClaimDto, UpdateClaimStatusDto, AddClaimItemDto } from './dto/create-insurance-claim.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('insurance-claims')
@UseGuards(RolesGuard)
export class InsuranceClaimsController {
  constructor(private readonly service: InsuranceClaimsService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR)
  create(@Body() dto: CreateInsuranceClaimDto, @Req() req: any) {
    return this.service.create(dto, req.user?.id);
  }

  @Get()
  findAll(@Query('status') status?: string, @Query('programCode') programCode?: string, @Query('branchId') branchId?: string, @Query('patientId') patientId?: string) {
    const query: any = {};
    if (status) query.status = status;
    if (programCode) query.programCode = programCode.toUpperCase();
    if (branchId) query.branchId = branchId;
    if (patientId) query.patientId = patientId;
    return this.service.findAll(query);
  }

  @Get('stats')
  getStats(@Query('branchId') branchId?: string) {
    return this.service.getStats(branchId);
  }

  @Get('visit/:visitId')
  findByVisit(@Param('visitId') visitId: string) {
    return this.service.findByVisit(visitId);
  }

  @Get('patient/:patientId')
  findByPatient(@Param('patientId') patientId: string) {
    return this.service.findByPatient(patientId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post(':id/items')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR)
  addItem(@Param('id') id: string, @Body() dto: AddClaimItemDto) {
    return this.service.addItem(id, dto);
  }

  @Delete(':id/items/:itemIndex')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR)
  removeItem(@Param('id') id: string, @Param('itemIndex') itemIndex: string) {
    return this.service.removeItem(id, parseInt(itemIndex, 10));
  }

  @Patch(':id/items/:itemIndex/coverage')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR)
  updateItemCoverage(
    @Param('id') id: string,
    @Param('itemIndex') itemIndex: string,
    @Body('coveredByInsurance') coveredByInsurance: boolean,
  ) {
    return this.service.updateItemCoverage(id, parseInt(itemIndex, 10), coveredByInsurance);
  }

  @Patch(':id/status')
  @Roles(UserRoleEnum.ADMIN)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateClaimStatusDto) {
    return this.service.updateStatus(id, dto);
  }

  @Post('mark-order-insurance')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  markOrderAsInsuranceCovered(@Body('orderId') orderId: string, @Req() req: any) {
    return this.service.markOrderAsInsuranceCovered(orderId, req.user?.id);
  }
}
