import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { DoctorsService } from './doctors.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

@Controller('doctors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async create(@Body() dto: CreateDoctorDto, @Request() req: any) {
    return this.doctorsService.create(dto, req.user?.branchId);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.LAB_TECH, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  async findAll(
    @Query('search') search?: string,
    @Query('activeOnly') activeOnly?: string,
    @Request() req?: any,
  ) {
    const active = activeOnly === undefined ? true : activeOnly !== 'false';
    return this.doctorsService.findAll(search, active, req?.user?.branchId);
  }

  @Get('specialists')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.RECEPTIONIST)
  async findSpecialists(@Query('specialty') specialty: string | undefined, @Request() req: any) {
    return this.doctorsService.findSpecialists(specialty, req.user?.branchId);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.LAB_TECH, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.doctorsService.findOne(id, req.user?.branchId);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateDoctorDto, @Request() req: any) {
    return this.doctorsService.update(id, dto, req.user?.branchId);
  }
}
