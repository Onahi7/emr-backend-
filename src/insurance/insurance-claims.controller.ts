import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { InsuranceClaimsService } from './insurance-claims.service';
import { CreateInsuranceClaimDto, UpdateClaimStatusDto, AddClaimItemDto, MarkOrderInsuranceDto } from './dto/create-insurance-claim.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('insurance-claims')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InsuranceClaimsController {
  constructor(private readonly service: InsuranceClaimsService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR)
  create(@Body() dto: CreateInsuranceClaimDto, @Req() req: any) {
    return this.service.create(dto, req.user?.userId, req.user?.branchId);
  }

  @Get()
  findAll(@Req() req: any, @Query('status') status?: string, @Query('programCode') programCode?: string, @Query('patientId') patientId?: string) {
    const query: any = {};
    if (status) query.status = status;
    if (programCode) query.programCode = programCode.toUpperCase();
    if (patientId) query.patientId = patientId;
    return this.service.findAll(query, req.user?.branchId);
  }

  @Get('stats')
  getStats(@Req() req: any) {
    return this.service.getStats(req.user?.branchId);
  }

  @Get('visit/:visitId')
  findByVisit(@Param('visitId') visitId: string, @Req() req: any) {
    return this.service.findByVisit(visitId, req.user?.branchId);
  }

  @Get('patient/:patientId')
  findByPatient(@Param('patientId') patientId: string, @Req() req: any) {
    return this.service.findByPatient(patientId, req.user?.branchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.service.findById(id, req.user?.branchId);
  }

  @Post(':id/items')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR)
  addItem(@Param('id') id: string, @Body() dto: AddClaimItemDto, @Req() req: any) {
    return this.service.addItem(id, dto, req.user?.branchId);
  }

  @Delete(':id/items/:itemIndex')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR)
  removeItem(@Param('id') id: string, @Param('itemIndex') itemIndex: string, @Req() req: any) {
    return this.service.removeItem(id, parseInt(itemIndex, 10), req.user?.branchId);
  }

  @Patch(':id/items/:itemIndex/coverage')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR)
  updateItemCoverage(
    @Param('id') id: string,
    @Param('itemIndex') itemIndex: string,
    @Body('coveredByInsurance') coveredByInsurance: boolean,
    @Req() req: any,
  ) {
    return this.service.updateItemCoverage(id, parseInt(itemIndex, 10), coveredByInsurance, req.user?.branchId);
  }

  @Patch(':id/status')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateClaimStatusDto, @Req() req: any) {
    return this.service.updateStatus(id, dto, req.user?.branchId, req.user?.userId);
  }

  @Post('mark-order-insurance')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  markOrderAsInsuranceCovered(@Body() dto: MarkOrderInsuranceDto, @Req() req: any) {
    return this.service.markOrderAsInsuranceCovered(
      dto.orderId,
      dto.insuranceAmount,
      req.user?.userId,
      req.user?.branchId,
      dto.verificationReference,
      dto.verificationNotes,
    );
  }
}
