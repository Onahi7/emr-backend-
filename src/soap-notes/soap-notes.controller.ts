import { Controller, Get, Post, Body, Patch, Param, Request, UseGuards } from '@nestjs/common';
import { SoapNotesService } from './soap-notes.service';
import { CreateSoapNoteDto } from './dto/create-soap-note.dto';
import { UpdateSoapNoteDto } from './dto/update-soap-note.dto';
import { CreateSoapAddendumDto } from './dto/create-soap-addendum.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('soap-notes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SoapNotesController {
  constructor(private readonly soapNotesService: SoapNotesService) {}

  private actor(req: any) {
    return { userId: req.user.userId, doctorId: req.user.doctorId, roles: req.user.roles };
  }

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  create(@Body() createSoapNoteDto: CreateSoapNoteDto, @Request() req: any) {
    return this.soapNotesService.create(createSoapNoteDto, req.user.branchId, this.actor(req));
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  findAll(@Request() req: any) {
    return this.soapNotesService.findAll(req.user.branchId);
  }

  @Get('patient/:patientId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  findByPatient(@Param('patientId') patientId: string, @Request() req: any) {
    return this.soapNotesService.findByPatient(patientId, req.user.branchId);
  }

  @Get('consultation/:consultationId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  findByConsultation(@Param('consultationId') consultationId: string, @Request() req: any) {
    return this.soapNotesService.findByConsultation(consultationId, req.user.branchId);
  }

  @Get('visit/:visitId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  findByVisit(@Param('visitId') visitId: string, @Request() req: any) {
    return this.soapNotesService.findByVisit(visitId, req.user.branchId);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  findById(@Param('id') id: string, @Request() req: any) {
    return this.soapNotesService.findById(id, req.user.branchId);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  update(@Param('id') id: string, @Body() updateSoapNoteDto: UpdateSoapNoteDto, @Request() req: any) {
    return this.soapNotesService.update(id, updateSoapNoteDto, req.user.branchId, this.actor(req));
  }

  @Patch(':id/sign')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR)
  sign(@Param('id') id: string, @Request() req: any) {
    return this.soapNotesService.sign(id, req.user.branchId, this.actor(req));
  }

  @Post(':id/addenda')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  createAddendum(@Param('id') id: string, @Body() dto: CreateSoapAddendumDto, @Request() req: any) {
    return this.soapNotesService.createAddendum(id, dto.text, req.user.branchId, this.actor(req));
  }
}
