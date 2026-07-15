import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Request,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  create(@Body() dto: CreateAppointmentDto, @Request() req: any) {
    return this.appointmentsService.create(dto, req.user?.userId, req.user?.branchId);
  }

  @Get()
  findAll(@Query() filters: any, @Request() req: any) {
    return this.appointmentsService.findAll({ ...filters, branchId: req.user?.branchId });
  }

  @Get('today')
  getTodaySchedule(@Query('doctorId') doctorId: string, @Request() req: any) {
    return this.appointmentsService.getTodaySchedule(doctorId, req.user?.branchId);
  }

  @Get('upcoming/:patientId')
  getUpcoming(@Param('patientId') patientId: string, @Request() req: any) {
    return this.appointmentsService.getUpcoming(patientId, req.user?.branchId);
  }

  @Get(':id')
  findById(@Param('id') id: string, @Request() req: any) {
    return this.appointmentsService.findById(id, req.user?.branchId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto, @Request() req: any) {
    return this.appointmentsService.update(id, dto, req.user?.branchId);
  }

  @Patch(':id/check-in')
  checkIn(@Param('id') id: string, @Request() req: any) {
    return this.appointmentsService.checkIn(id, req.user?.branchId);
  }
}
