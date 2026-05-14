import {
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { VisitStatusEnum } from '../database/schemas/visit.schema';

@Controller('visits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  /**
   * Create a new visit (Reception registers patient)
   * POST /visits
   */
  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  create(@Body() createVisitDto: CreateVisitDto, @Request() req: any) {
    return this.visitsService.create({
      ...createVisitDto,
      registeredBy: req.user?.userId,
    });
  }

  /**
   * Get all visits with optional filters
   * GET /visits
   */
  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  findAll(
    @Query('status') status?: VisitStatusEnum,
    @Query('patientId') patientId?: string,
    @Query('doctorId') doctorId?: string,
  ) {
    const query: any = {};
    if (status) query.status = status;
    if (patientId) query.patientId = patientId;
    if (doctorId) query.doctorId = doctorId;
    return this.visitsService.findAll(query);
  }

  /**
   * Get doctor queue - patients waiting for consultation
   * GET /visits/doctor-queue
   */
  @Get('doctor-queue')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  getDoctorQueue(@Query('doctorId') doctorId?: string) {
    return this.visitsService.getDoctorQueue(doctorId);
  }

  /**
   * Get visits awaiting lab payment
   * GET /visits/awaiting-lab-payment
   */
  @Get('awaiting-lab-payment')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  getAwaitingLabPayment() {
    return this.visitsService.getAwaitingLabPayment();
  }

  /**
   * Get visits awaiting pharmacy payment
   * GET /visits/awaiting-pharmacy-payment
   */
  @Get('awaiting-pharmacy-payment')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  getAwaitingPharmacyPayment() {
    return this.visitsService.getAwaitingPharmacyPayment();
  }

  /**
   * Get visits awaiting dispensing (pharmacy paid)
   * GET /visits/awaiting-dispensing
   */
  @Get('awaiting-dispensing')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST)
  getAwaitingDispensing() {
    return this.visitsService.getAwaitingDispensing();
  }

  /**
   * Get visits awaiting triage (nurse takes vitals + priority)
   * GET /visits/awaiting-triage
   */
  @Get('awaiting-triage')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.NURSE)
  getAwaitingTriage() {
    return this.visitsService.getAwaitingTriage();
  }

  /**
   * Reception dashboard — aggregated pending actions + today stats
   * GET /visits/reception-dashboard
   */
  @Get('reception-dashboard')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  getReceptionDashboard() {
    return this.visitsService.getReceptionDashboard();
  }

  /**
   * Doctor dashboard — queue, active patients, results ready
   * GET /visits/doctor-dashboard
   */
  @Get('doctor-dashboard')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  getDoctorDashboard(@Request() req: any) {
    return this.visitsService.getDoctorDashboard(req.user?.userId);
  }

  /**
   * Get visit statistics
   * GET /visits/stats
   */
  @Get('stats')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  getStats(@Query('date') date?: string) {
    return this.visitsService.getStats(date);
  }

  /**
   * Get visits by patient ID
   * GET /visits/patient/:patientId
   */
  @Get('patient/:patientId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  findByPatient(@Param('patientId') patientId: string) {
    return this.visitsService.findByPatient(patientId);
  }

  /**
   * Get visit by ID
   * GET /visits/:id
   */
  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  findOne(@Param('id') id: string) {
    return this.visitsService.findById(id);
  }

  /**
   * Update visit
   * PATCH /visits/:id
   */
  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR)
  update(@Param('id') id: string, @Body() updateVisitDto: UpdateVisitDto) {
    return this.visitsService.update(id, updateVisitDto);
  }

  /**
   * Mark consultation as paid (Reception confirms payment)
   * PATCH /visits/:id/mark-paid
   */
  @Patch(':id/mark-paid')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  markConsultationPaid(
    @Param('id') id: string,
    @Body() body: { paymentMethod?: string },
    @Request() req: any,
  ) {
    return this.visitsService.markConsultationPaid(id, body.paymentMethod || 'cash', req.user?.userId);
  }

  /**
   * Doctor accepts patient from queue
   * PATCH /visits/:id/accept
   */
  @Patch(':id/accept')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  acceptPatient(@Param('id') id: string, @Request() req: any) {
    return this.visitsService.acceptPatient(id, req.user?.userId);
  }

  /**
   * Doctor orders lab tests
   * PATCH /visits/:id/order-lab
   */
  @Patch(':id/order-lab')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  orderLab(@Param('id') id: string) {
    return this.visitsService.orderLab(id);
  }

  /**
   * Doctor prescribes medication
   * PATCH /visits/:id/prescribe
   */
  @Patch(':id/prescribe')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  prescribeMedication(@Param('id') id: string) {
    return this.visitsService.prescribeMedication(id);
  }

  /**
   * Mark lab payment as paid
   * PATCH /visits/:id/mark-lab-paid
   */
  @Patch(':id/mark-lab-paid')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  markLabPaid(@Param('id') id: string) {
    return this.visitsService.markLabPaid(id);
  }

  /**
   * Mark pharmacy payment as paid
   * PATCH /visits/:id/mark-pharmacy-paid
   */
  @Patch(':id/mark-pharmacy-paid')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  markPharmacyPaid(
    @Param('id') id: string,
    @Body() body: { paymentMethod?: string },
    @Request() req: any,
  ) {
    return this.visitsService.markPharmacyPaid(id, body.paymentMethod || 'cash', req.user?.userId);
  }

  /**
   * Mark drugs as dispensed — pharmacist confirms dispensing
   * PATCH /visits/:id/mark-dispensed
   */
  @Patch(':id/mark-dispensed')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST)
  markDispensed(@Param('id') id: string) {
    return this.visitsService.markDispensed(id);
  }

  /**
   * Mark results as released
   * PATCH /visits/:id/results-released
   */
  @Patch(':id/results-released')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  resultsReleased(@Param('id') id: string) {
    return this.visitsService.resultsReleased(id);
  }

  /**
   * Complete visit
   * PATCH /visits/:id/complete
   */
  @Patch(':id/complete')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  complete(@Param('id') id: string) {
    return this.visitsService.complete(id);
  }

  /**
   * Nurse completes triage — moves from AWAITING_TRIAGE to IN_QUEUE
   * PATCH /visits/:id/triage
   */
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
    },
    @Request() req: any,
  ) {
    return this.visitsService.completeTriage(id, body, req.user?.userId);
  }

  /**
   * Doctor refers patient to a specialist
   * PATCH /visits/:id/refer
   */
  @Patch(':id/refer')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  referToSpecialist(
    @Param('id') id: string,
    @Body() body: { specialistId: string; reason: string; notes?: string },
    @Request() req: any,
  ) {
    return this.visitsService.referToSpecialist(id, body, req.user?.userId);
  }

  /**
   * Specialist accepts referral (moves to IN_CONSULTATION)
   * PATCH /visits/:id/accept-referral
   */
  @Patch(':id/accept-referral')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.SPECIALIST, UserRoleEnum.DOCTOR)
  acceptReferral(@Param('id') id: string, @Request() req: any) {
    return this.visitsService.acceptReferral(id, req.user?.userId);
  }

  /**
   * Cancel visit
   * PATCH /visits/:id/cancel
   */
  @Patch(':id/cancel')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  cancel(
    @Param('id') id: string,
    @Body() body: { reason: string; cancelledBy: string },
  ) {
    return this.visitsService.cancel(id, body.reason, body.cancelledBy);
  }
}
