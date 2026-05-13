import { Controller, Get, Post, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { SoapNotesService } from './soap-notes.service';
import { CreateSoapNoteDto } from './dto/create-soap-note.dto';
import { UpdateSoapNoteDto } from './dto/update-soap-note.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('soap-notes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SoapNotesController {
  constructor(private readonly soapNotesService: SoapNotesService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  create(@Body() createSoapNoteDto: CreateSoapNoteDto) {
    return this.soapNotesService.create(createSoapNoteDto);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  findAll() {
    return this.soapNotesService.findAll();
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  findById(@Param('id') id: string) {
    return this.soapNotesService.findById(id);
  }

  @Get('patient/:patientId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  findByPatient(@Param('patientId') patientId: string) {
    return this.soapNotesService.findByPatient(patientId);
  }

  @Get('consultation/:consultationId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  findByConsultation(@Param('consultationId') consultationId: string) {
    return this.soapNotesService.findByConsultation(consultationId);
  }

  @Get('visit/:visitId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  findByVisit(@Param('visitId') visitId: string) {
    return this.soapNotesService.findByVisit(visitId);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  update(@Param('id') id: string, @Body() updateSoapNoteDto: UpdateSoapNoteDto) {
    return this.soapNotesService.update(id, updateSoapNoteDto);
  }

  @Patch(':id/sign')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR)
  sign(@Param('id') id: string, @Body() body: { signedBy: string }) {
    return this.soapNotesService.sign(id, body.signedBy);
  }
}
