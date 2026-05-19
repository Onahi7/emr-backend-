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
  create(@Body() dto: CreateAppointmentDto, @Query('userId') userId?: string) {
    return this.appointmentsService.create(dto, userId);
  }

  @Get()
  findAll(@Query() filters: any) {
    return this.appointmentsService.findAll(filters);
  }

  @Get('today')
  getTodaySchedule(@Query('doctorId') doctorId?: string) {
    return this.appointmentsService.getTodaySchedule(doctorId);
  }

  @Get('upcoming/:patientId')
  getUpcoming(@Param('patientId') patientId: string) {
    return this.appointmentsService.getUpcoming(patientId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.appointmentsService.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.appointmentsService.update(id, dto);
  }

  @Patch(':id/check-in')
  checkIn(@Param('id') id: string) {
    return this.appointmentsService.checkIn(id);
  }
}
