import { Controller, Post, Body, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  create(@Body() createPaymentDto: CreatePaymentDto) {
    return this.paymentsService.createPayment(createPaymentDto);
  }

  @Get('visit/:visitId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR)
  findByVisit(@Param('visitId') visitId: string) {
    return this.paymentsService.findByVisit(visitId);
  }

  @Get('order/:orderId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  findByOrder(@Param('orderId') orderId: string) {
    return this.paymentsService.findByOrder(orderId);
  }

  @Get('consultation/:consultationId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  findByConsultation(@Param('consultationId') consultationId: string) {
    return this.paymentsService.findByConsultation(consultationId);
  }

  @Get('prescription/:prescriptionId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.PHARMACIST)
  findByPrescription(@Param('prescriptionId') prescriptionId: string) {
    return this.paymentsService.findByPrescription(prescriptionId);
  }

  @Patch(':id/refund')
  @Roles(UserRoleEnum.ADMIN)
  refund(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.paymentsService.refund(id, body.reason);
  }
}
