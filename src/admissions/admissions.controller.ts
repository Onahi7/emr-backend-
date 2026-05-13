import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { AdmissionStatusEnum } from '../database/schemas/admission.schema';
import { AdmissionsService } from './admissions.service';
import { CreateAdmissionDto } from './dto/create-admission.dto';

@Controller('admissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdmissionsController {
  constructor(private readonly admissionsService: AdmissionsService) {}

  // ---------- CRUD ----------
  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  create(@Body() dto: CreateAdmissionDto, @Request() req: any) {
    return this.admissionsService.create(dto, req.user?.userId);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  findAll(
    @Query('status') status?: AdmissionStatusEnum,
    @Query('wardType') wardType?: string,
    @Query('nurseId') nurseId?: string,
  ) {
    return this.admissionsService.findAll(status, wardType, nurseId);
  }

  @Get('active')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  findActive() {
    return this.admissionsService.findActive();
  }

  @Get('dashboard')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE)
  getDashboard(@Request() req: any, @Query('mine') mine?: string) {
    const nurseId = mine === 'true' ? req.user?.userId : undefined;
    return this.admissionsService.getNurseDashboard(nurseId);
  }

  @Get('stats')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  getStats() {
    return this.admissionsService.getStats();
  }

  @Get('patient/:patientId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  findByPatient(@Param('patientId') patientId: string) {
    return this.admissionsService.findByPatient(patientId);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  findOne(@Param('id') id: string) {
    return this.admissionsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  update(@Param('id') id: string, @Body() data: any) {
    return this.admissionsService.update(id, data);
  }

  // ---------- Vitals ----------
  @Post(':id/vitals')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  recordVitals(@Param('id') id: string, @Body() vitals: any, @Request() req: any) {
    return this.admissionsService.recordVitals(id, vitals, req.user?.userId);
  }

  // ---------- Medications ----------
  @Post(':id/medications')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE)
  recordMedication(@Param('id') id: string, @Body() med: any, @Request() req: any) {
    return this.admissionsService.recordMedication(id, med, req.user?.userId);
  }

  // ---------- Fluids ----------
  @Post(':id/fluids')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE)
  recordFluid(@Param('id') id: string, @Body() entry: any, @Request() req: any) {
    return this.admissionsService.recordFluid(id, entry, req.user?.userId);
  }

  @Get(':id/fluid-balance')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  getFluidBalance(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.admissionsService.getFluidBalance(id, startDate, endDate);
  }

  // ---------- Nursing notes (SOAP) ----------
  @Post(':id/nursing-notes')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE)
  addNursingNote(@Param('id') id: string, @Body() note: any, @Request() req: any) {
    return this.admissionsService.addNursingNote(id, note, req.user?.userId);
  }

  // ---------- Care plan ----------
  @Post(':id/care-plan')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE)
  addCarePlanItem(@Param('id') id: string, @Body() item: any, @Request() req: any) {
    return this.admissionsService.addCarePlanItem(id, item, req.user?.userId);
  }

  @Patch(':id/care-plan/:index/resolve')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE)
  resolveCarePlanItem(
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() body: { evaluation?: string },
  ) {
    return this.admissionsService.resolveCarePlanItem(id, parseInt(index, 10), body.evaluation);
  }

  // ---------- Incidents ----------
  @Post(':id/incidents')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  reportIncident(@Param('id') id: string, @Body() incident: any, @Request() req: any) {
    return this.admissionsService.reportIncident(id, incident, req.user?.userId);
  }

  // ---------- Transfer / Discharge ----------
  @Patch(':id/transfer')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  transfer(
    @Param('id') id: string,
    @Body() data: { wardType?: string; bedNumber?: string; notes?: string },
    @Request() req: any,
  ) {
    return this.admissionsService.transfer(id, data, req.user?.userId);
  }

  @Patch(':id/discharge')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  discharge(
    @Param('id') id: string,
    @Body() data: { dischargeNotes?: string; dischargeDiagnosis?: string; dischargeInstructions?: string },
    @Request() req: any,
  ) {
    return this.admissionsService.discharge(id, data, req.user?.userId);
  }
}
