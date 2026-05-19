import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { CreatePatientNoteDto } from './dto/create-patient-note.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async create(@Body() createPatientDto: CreatePatientDto, @Request() req: any) {
    return this.patientsService.create(createPatientDto, req.user?.userId);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 1000;
    return this.patientsService.findAll(pageNum, limitNum, search);
  }

  @Get('search')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async search(@Query('q') query: string) {
    return this.patientsService.search(query);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async update(
    @Param('id') id: string,
    @Body() updatePatientDto: UpdatePatientDto,
  ) {
    return this.patientsService.update(id, updatePatientDto);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.patientsService.remove(id);
  }

  @Post(':id/notes')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async addNote(
    @Param('id') id: string,
    @Body() createNoteDto: CreatePatientNoteDto,
    @Request() req: any,
  ) {
    return this.patientsService.addNote(id, createNoteDto, req.user?.userId);
  }

  @Get(':id/notes')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async getNotes(@Param('id') id: string) {
    return this.patientsService.getNotes(id);
  }

  @Get(':id/orders')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async getOrders(@Param('id') id: string) {
    return this.patientsService.getOrders(id);
  }

    @Get(':id/results')
    @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
    async getResults(@Param('id') id: string) {
      return this.patientsService.getResults(id);
    }

    @Get(':id/chart')
    @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
    async getChart(@Param('id') id: string, @Request() req: any) {
      return this.patientsService.getPatientChart(id, req.user?.roles || []);
    }

  // Wallet endpoints
  @Get(':id/wallet')
  async getWallet(@Param('id') id: string) {
    return this.patientsService.getWalletBalance(id);
  }

  @Post(':id/wallet/deposit')
  async depositWallet(@Param('id') id: string, @Body() body: { amount: number; notes?: string }) {
    return this.patientsService.depositToWallet(id, body.amount, body.notes);
  }

  @Post(':id/wallet/withdraw')
  async withdrawWallet(@Param('id') id: string, @Body() body: { amount: number; notes?: string }) {
    return this.patientsService.withdrawFromWallet(id, body.amount, body.notes);
  }

  @Post(':id/wallet/pay')
  async payFromWallet(@Param('id') id: string, @Body() body: { amount: number; orderId?: string }) {
    return this.patientsService.payFromWallet(id, body.amount, body.orderId);
  }
}
