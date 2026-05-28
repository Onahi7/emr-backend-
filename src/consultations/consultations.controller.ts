import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { ConsultationStatusEnum } from '../database/schemas/consultation.schema';

@Controller('consultations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  create(@Body() createConsultationDto: CreateConsultationDto, @Request() req: any) {
    return this.consultationsService.create(createConsultationDto, req.user?.branchId);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  findAll(@Query('status') status?: ConsultationStatusEnum, @Request() req?: any) {
    const query = status ? { status } : {};
    return this.consultationsService.findAll(query, req?.user?.branchId);
  }

  @Get('patient/:patientId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  findByPatient(@Param('patientId') patientId: string, @Request() req?: any) {
    return this.consultationsService.findByPatient(patientId, req?.user?.branchId);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  findOne(@Param('id') id: string, @Request() req?: any) {
    return this.consultationsService.findById(id, req?.user?.branchId);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  update(@Param('id') id: string, @Body() updateConsultationDto: UpdateConsultationDto, @Request() req?: any) {
    return this.consultationsService.update(id, updateConsultationDto, req?.user?.branchId);
  }

  @Patch(':id/mark-paid')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  markAsPaid(@Param('id') id: string, @Request() req?: any) {
    return this.consultationsService.markAsPaid(id, req?.user?.branchId);
  }

  @Patch(':id/cancel')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  cancel(@Param('id') id: string, @Body() body: { reason: string; cancelledBy: string }, @Request() req?: any) {
    return this.consultationsService.cancel(id, body.reason, body.cancelledBy, req?.user?.branchId);
  }
}
