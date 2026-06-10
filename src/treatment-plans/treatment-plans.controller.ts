import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request } from '@nestjs/common';
import { TreatmentPlansService } from './treatment-plans.service';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import { PayTreatmentPlanDto } from './dto/pay-treatment-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('treatment-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TreatmentPlansController {
  constructor(private readonly treatmentPlansService: TreatmentPlansService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  create(@Body() dto: CreateTreatmentPlanDto, @Request() req: any) {
    const user = req.user;
    return this.treatmentPlansService.create(dto, user.userId, user.branchId, user.role);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  findAll(@Request() req: any) {
    return this.treatmentPlansService.findAll({}, req.user?.branchId);
  }

  @Get('sent')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  getSentPlans(@Request() req: any) {
    return this.treatmentPlansService.getSentPlans(req.user?.branchId);
  }

  @Get('patient/:patientId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  getForPatient(@Param('patientId') patientId: string, @Request() req: any) {
    return this.treatmentPlansService.getForPatient(patientId, req.user?.branchId);
  }

  @Get('visit/:visitId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  getForVisit(@Param('visitId') visitId: string, @Request() req: any) {
    return this.treatmentPlansService.getForVisit(visitId, req.user?.branchId);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  findOne(@Param('id') id: string) {
    return this.treatmentPlansService.findById(id);
  }

  @Post(':id/send')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  sendToReception(@Param('id') id: string) {
    return this.treatmentPlansService.sendToReception(id);
  }

  @Post(':id/print')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  markPrinted(@Param('id') id: string, @Request() req: any) {
    return this.treatmentPlansService.markPrinted(id, req.user?.userId);
  }

  @Post(':id/pay')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  pay(@Param('id') id: string, @Body() dto: PayTreatmentPlanDto, @Request() req: any) {
    return this.treatmentPlansService.pay(id, dto, req.user?.userId, req.user?.branchId);
  }

  @Patch(':id/status')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.treatmentPlansService.updateStatus(id, status as any);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.treatmentPlansService.cancel(id, req.user?.userId);
  }
}
