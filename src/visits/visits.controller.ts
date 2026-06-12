import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { VisitsService } from './visits.service';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';
import { RapidTestResultDto } from './dto/rapid-test-result.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { VisitStatusEnum } from '../database/schemas/visit.schema';

@Controller('visits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  create(@Body() createVisitDto: CreateVisitDto, @Request() req: any) {
    return this.visitsService.create(
      {
        ...createVisitDto,
        registeredBy: req.user?.userId,
      },
      req.user?.branchId,
    );
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  findAll(
    @Query('status') status?: VisitStatusEnum,
    @Query('patientId') patientId?: string,
    @Query('doctorId') doctorId?: string,
    @Request() req?: any,
  ) {
    const query: any = {};
    if (status) query.status = status;
    if (patientId) query.patientId = patientId;
    if (doctorId) query.doctorId = doctorId;
    return this.visitsService.findAll(query, req?.user?.branchId);
  }

  @Get('doctor-queue')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  getDoctorQueue(@Query('doctorId') doctorId?: string, @Request() req?: any) {
    return this.visitsService.getDoctorQueue(doctorId, req?.user?.branchId);
  }

  @Get('awaiting-lab-payment')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  getAwaitingLabPayment(@Request() req?: any) {
    return this.visitsService.getAwaitingLabPayment(req?.user?.branchId);
  }

  @Get('awaiting-pharmacy-payment')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  getAwaitingPharmacyPayment(@Request() req?: any) {
    return this.visitsService.getAwaitingPharmacyPayment(req?.user?.branchId);
  }

  @Get('awaiting-dispensing')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST)
  getAwaitingDispensing(@Request() req?: any) {
    return this.visitsService.getAwaitingDispensing(req?.user?.branchId);
  }

  @Get('awaiting-triage')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE)
  getAwaitingTriage(@Request() req?: any) {
    return this.visitsService.getAwaitingTriage(req?.user?.branchId);
  }

  @Get('reception-dashboard')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  getReceptionDashboard(@Request() req?: any) {
    return this.visitsService.getReceptionDashboard(req?.user?.branchId);
  }

  @Get('doctor-dashboard')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  getDoctorDashboard(@Request() req: any) {
    return this.visitsService.getDoctorDashboard(req.user?.userId, req.user?.branchId);
  }

  @Get('doctor-patients')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  getDoctorPatients(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('daysBack') daysBack?: string,
    @Request() req?: any,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit || '50', 10) || 50));
    const daysBackNum = daysBack ? Math.max(0, parseInt(daysBack, 10) || 0) : undefined;
    return this.visitsService.getDoctorPatients(
      req.user?.userId,
      req.user?.branchId,
      pageNum,
      limitNum,
      (search || '').trim(),
      daysBackNum,
    );
  }

  @Get('stats')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  getStats(@Query('date') date?: string, @Request() req?: any) {
    return this.visitsService.getStats(date, req?.user?.branchId);
  }

  @Get('patient/:patientId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  findByPatient(@Param('patientId') patientId: string, @Request() req?: any) {
    return this.visitsService.findByPatient(patientId, req?.user?.branchId);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  findOne(@Param('id') id: string, @Request() req?: any) {
    return this.visitsService.findById(id, req?.user?.branchId);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  update(@Param('id') id: string, @Body() updateVisitDto: UpdateVisitDto, @Request() req?: any) {
    return this.visitsService.update(id, updateVisitDto, req?.user?.branchId);
  }

  @Patch(':id/mark-paid')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  markConsultationPaid(
    @Param('id') id: string,
    @Body() body: { paymentMethod?: string },
    @Request() req: any,
  ) {
    return this.visitsService.markConsultationPaid(id, body.paymentMethod || 'cash', req.user?.userId, req.user?.branchId);
  }

  @Patch(':id/accept')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  acceptPatient(@Param('id') id: string, @Request() req: any) {
    return this.visitsService.acceptPatient(id, req.user?.userId, req.user?.branchId);
  }

  @Patch(':id/order-lab')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  orderLab(@Param('id') _id: string) {
    throw new BadRequestException(
      'Deprecated endpoint. Create a lab order via POST /orders (orderType=lab, visitId).',
    );
  }

  @Patch(':id/prescribe')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  prescribeMedication(@Param('id') _id: string) {
    throw new BadRequestException(
      'Deprecated endpoint. Create a pharmacy order via POST /orders (orderType=pharmacy, visitId).',
    );
  }

  @Patch(':id/mark-lab-paid')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  markLabPaid(@Param('id') _id: string) {
    throw new BadRequestException(
      'Deprecated endpoint. Mark the corresponding lab order paid via PATCH /orders/:id/mark-paid.',
    );
  }

  @Patch(':id/mark-pharmacy-paid')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  markPharmacyPaid(
    @Param('id') _id: string,
  ) {
    throw new BadRequestException(
      'Deprecated endpoint. Mark the corresponding pharmacy order paid via PATCH /orders/:id/mark-paid.',
    );
  }

  @Patch(':id/mark-dispensed')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST)
  markDispensed(@Param('id') id: string, @Request() req?: any) {
    return this.visitsService.markDispensed(id, req?.user?.branchId);
  }

  @Patch(':id/results-released')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  resultsReleased(@Param('id') id: string, @Request() req?: any) {
    return this.visitsService.resultsReleased(id, req?.user?.branchId);
  }

  @Patch(':id/complete')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  complete(@Param('id') id: string, @Request() req?: any) {
    return this.visitsService.complete(id, req?.user?.branchId);
  }

  @Patch(':id/triage')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE)
  completeTriage(
    @Param('id') id: string,
    @Body() body: {
      temperature?: number;
      bloodPressure?: string;
      heartRate?: number;
      respiratoryRate?: number;
      weight?: number;
      height?: number;
      oxygenSaturation?: number;
      triagePriority?: string;
      triageNotes?: string;
      chiefComplaint?: string;
      doctorId?: string;
    },
    @Request() req: any,
  ) {
    return this.visitsService.completeTriage(id, body, req.user?.userId, req.user?.branchId);
  }

  @Patch(':id/assign-doctor')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE)
  assignDoctorFromQueue(
    @Param('id') id: string,
    @Body() body: { doctorId: string },
    @Request() req: any,
  ) {
    return this.visitsService.assignDoctorFromQueue(id, body.doctorId, req.user?.userId, req.user?.branchId);
  }

  @Patch(':id/rapid-test-result')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE)
  addRapidTestResult(
    @Param('id') id: string,
    @Body() body: RapidTestResultDto,
    @Request() req: any,
  ) {
    return this.visitsService.addRapidTestResult(id, body, req.user?.userId, req.user?.branchId);
  }

  @Patch(':id/refer')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  referToSpecialist(
    @Param('id') id: string,
    @Body() body: { specialistId: string; reason: string; notes?: string },
    @Request() req: any,
  ) {
    return this.visitsService.referToSpecialist(id, body, req.user?.userId, req.user?.branchId);
  }

  @Patch(':id/accept-referral')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.SPECIALIST, UserRoleEnum.DOCTOR)
  acceptReferral(@Param('id') id: string, @Request() req: any) {
    return this.visitsService.acceptReferral(id, req.user?.userId, req.user?.branchId);
  }

  @Patch(':id/cancel')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  cancel(
    @Param('id') id: string,
    @Body() body: { reason: string; cancelledBy: string },
    @Request() req?: any,
  ) {
    return this.visitsService.cancel(id, body.reason, body.cancelledBy, req?.user?.branchId);
  }

  @Post('backfill-branch')
  @Roles(UserRoleEnum.ADMIN)
  async backfillBranchId(@Body('branchId') branchId: string) {
    if (!branchId) throw new BadRequestException('branchId required');
    const result = await this.visitsService.backfillMissingBranchId(branchId);
    return { updated: result.modifiedCount, branchId };
  }
}
