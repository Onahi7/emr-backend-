import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  create(@Body() dto: CreateAppointmentDto, @Query('userId') userId?: string, @Query('branchId') branchId?: string) {
    return this.appointmentsService.create(dto, userId, branchId);
  }

  @Get()
  findAll(@Query() filters: any) {
    return this.appointmentsService.findAll(filters);
  }

  @Get('today')
  getTodaySchedule(@Query('doctorId') doctorId?: string, @Query('branchId') branchId?: string) {
    return this.appointmentsService.getTodaySchedule(doctorId, branchId);
  }

  @Get('upcoming/:patientId')
  getUpcoming(@Param('patientId') patientId: string, @Query('branchId') branchId?: string) {
    return this.appointmentsService.getUpcoming(patientId, branchId);
  }

  @Get(':id')
  findById(@Param('id') id: string, @Query('branchId') branchId?: string) {
    return this.appointmentsService.findById(id, branchId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto, @Query('branchId') branchId?: string) {
    return this.appointmentsService.update(id, dto, branchId);
  }

  @Patch(':id/check-in')
  checkIn(@Param('id') id: string, @Query('branchId') branchId?: string) {
    return this.appointmentsService.checkIn(id, branchId);
  }
}
