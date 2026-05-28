import { Controller, Get, Post, Body, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import { DispensePrescriptionDto } from './dto/dispense-prescription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('prescriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  create(@Body() createPrescriptionDto: CreatePrescriptionDto, @Request() req: any) {
    return this.prescriptionsService.create(createPrescriptionDto, req.user?.userId);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST, UserRoleEnum.PHARMACIST)
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
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.RECEPTIONIST)
  findPendingDispense() {
    return this.prescriptionsService.findPendingDispense();
  }

  @Get('patient/:patientId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST, UserRoleEnum.PHARMACIST)
  findByPatient(@Param('patientId') patientId: string) {
    return this.prescriptionsService.findAll({ patientId });
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST, UserRoleEnum.PHARMACIST)
  findOne(@Param('id') id: string) {
    return this.prescriptionsService.findById(id);
  }

  /**
   * Edit prescription (items, notes, total) — only before payment
   * PATCH /prescriptions/:id
   */
  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  update(
    @Param('id') id: string,
    @Body() updatePrescriptionDto: UpdatePrescriptionDto,
  ) {
    return this.prescriptionsService.update(id, updatePrescriptionDto);
  }

  /**
   * Pharmacist dispenses prescription
   * PATCH /prescriptions/:id/dispense
   */
  @Patch(':id/dispense')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.RECEPTIONIST)
  dispense(
    @Param('id') id: string,
    @Body() dto: DispensePrescriptionDto,
    @Request() req: any,
  ) {
    return this.prescriptionsService.dispense(id, req.user?.userId, dto);
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
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  cancel(@Param('id') id: string, @Body() body: { reason: string }, @Request() req: any) {
    return this.prescriptionsService.cancel(id, body.reason, req.user?.userId);
  }
}
