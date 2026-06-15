import { Controller, Get, Post, Body, Patch, Delete, Param, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
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
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  create(@Body() createPrescriptionDto: CreatePrescriptionDto, @Request() req: any) {
    return this.prescriptionsService.create(createPrescriptionDto, req.user?.userId, req.user?.branchId, req.user?.role);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST, UserRoleEnum.PHARMACIST)
  findAll(@Request() req: any) {
    return this.prescriptionsService.findAll({}, req.user?.branchId);
  }

  /**
   * Prescriptions awaiting payment — shown on Reception dashboard
   * GET /prescriptions/pending-payment
   */
  @Get('pending-payment')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  findPendingPayment(@Request() req: any) {
    return this.prescriptionsService.findPendingPayment(req.user?.branchId);
  }

  /**
   * Prescriptions paid and awaiting dispensing — shown on Pharmacy dashboard
   * GET /prescriptions/pending-dispense
   */
  @Get('pending-dispense')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.RECEPTIONIST)
  findPendingDispense(@Request() req: any) {
    return this.prescriptionsService.findPendingDispense(req.user?.branchId);
  }

  @Get('patient/:patientId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST, UserRoleEnum.PHARMACIST)
  findByPatient(@Param('patientId') patientId: string, @Request() req: any) {
    return this.prescriptionsService.findAll({ patientId }, req.user?.branchId);
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
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
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
  markAsPaid(@Param('id') id: string, @Body() body: { paymentMethod?: string }, @Request() req: any) {
    return this.prescriptionsService.markAsPaid(id, body.paymentMethod, req.user?.userId, req.user?.branchId);
  }

  @Patch(':id/cancel')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  cancel(@Param('id') id: string, @Body() body: { reason: string }, @Request() req: any) {
    return this.prescriptionsService.cancel(id, body.reason, req.user?.userId);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.prescriptionsService.remove(id);
  }
}
