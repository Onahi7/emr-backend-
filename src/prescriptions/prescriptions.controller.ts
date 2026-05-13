import { Controller, Get, Post, Body, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('prescriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR)
  create(@Body() createPrescriptionDto: CreatePrescriptionDto) {
    return this.prescriptionsService.create(createPrescriptionDto);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST, UserRoleEnum.PHARMACIST)
  findAll() {
    return this.prescriptionsService.findAll({});
  }

  /**
   * Prescriptions awaiting payment — shown on Reception dashboard
   * GET /prescriptions/pending-payment
   */
  @Get('pending-payment')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  findPendingPayment() {
    return this.prescriptionsService.findPendingPayment();
  }

  /**
   * Prescriptions paid and awaiting dispensing — shown on Pharmacy dashboard
   * GET /prescriptions/pending-dispense
   */
  @Get('pending-dispense')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST)
  findPendingDispense() {
    return this.prescriptionsService.findPendingDispense();
  }

  @Get('patient/:patientId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST, UserRoleEnum.PHARMACIST)
  findByPatient(@Param('patientId') patientId: string) {
    return this.prescriptionsService.findAll({ patientId });
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST, UserRoleEnum.PHARMACIST)
  findOne(@Param('id') id: string) {
    return this.prescriptionsService.findById(id);
  }

  /**
   * Pharmacist dispenses prescription
   * PATCH /prescriptions/:id/dispense
   */
  @Patch(':id/dispense')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST)
  dispense(@Param('id') id: string, @Request() req: any) {
    return this.prescriptionsService.dispense(id, req.user?.userId);
  }

  /**
   * Reception marks prescription as paid
   * PATCH /prescriptions/:id/mark-paid
   */
  @Patch(':id/mark-paid')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  markAsPaid(@Param('id') id: string) {
    return this.prescriptionsService.markAsPaid(id);
  }

  @Patch(':id/cancel')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR)
  cancel(@Param('id') id: string, @Body() body: { reason: string }, @Request() req: any) {
    return this.prescriptionsService.cancel(id, body.reason, req.user?.userId);
  }
}
