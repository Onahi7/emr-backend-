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
    return this.patientsService.create(createPatientDto, req.user?.userId, req.user?.branchId);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Request() req?: any,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 1000;
    return this.patientsService.findAll(pageNum, limitNum, search, req?.user?.branchId);
  }

  @Get('search')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async search(@Query('q') query: string, @Request() req: any) {
    return this.patientsService.search(query, req.user?.branchId);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.patientsService.findOne(id, req.user?.branchId);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async update(
    @Param('id') id: string,
    @Body() updatePatientDto: UpdatePatientDto,
    @Request() req: any,
  ) {
    return this.patientsService.update(id, updatePatientDto, req.user?.branchId);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.patientsService.remove(id, req.user?.branchId);
  }

  @Post(':id/notes')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async addNote(
    @Param('id') id: string,
    @Body() createNoteDto: CreatePatientNoteDto,
    @Request() req: any,
  ) {
    return this.patientsService.addNote(id, createNoteDto, req.user?.userId, req.user?.branchId);
  }

  @Get(':id/notes')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async getNotes(@Param('id') id: string, @Request() req: any) {
    return this.patientsService.getNotes(id, req.user?.branchId);
  }

  @Get(':id/orders')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async getOrders(@Param('id') id: string, @Request() req: any) {
    return this.patientsService.getOrders(id, req.user?.branchId);
  }

    @Get(':id/results')
    @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
    async getResults(@Param('id') id: string, @Request() req: any) {
      return this.patientsService.getResults(id, req.user?.branchId);
    }

    @Get(':id/chart')
    @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
    async getChart(@Param('id') id: string, @Request() req: any) {
      return this.patientsService.getPatientChart(id, req.user?.roles || [], req.user?.branchId);
    }

  // Wallet endpoints
  @Get(':id/wallet')
  async getWallet(@Param('id') id: string, @Request() req: any) {
    return this.patientsService.getWalletBalance(id, req.user?.branchId);
  }

  @Get(':id/wallet/transactions')
  async getWalletTransactions(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Request() req?: any,
  ) {
    return this.patientsService.getWalletTransactions(id, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 50, req?.user?.branchId);
  }

  @Post(':id/wallet/deposit')
  async depositWallet(@Param('id') id: string, @Body() body: { amount: number; notes?: string; paymentMethod?: string }, @Request() req: any) {
    return this.patientsService.depositToWallet(id, body.amount, body.notes, req.user?.userId, body.paymentMethod || 'cash', req.user?.branchId);
  }

  @Post(':id/wallet/withdraw')
  async withdrawWallet(@Param('id') id: string, @Body() body: { amount: number; notes?: string }, @Request() req: any) {
    return this.patientsService.withdrawFromWallet(id, body.amount, body.notes, req.user?.userId, req.user?.branchId);
  }

  @Post(':id/wallet/pay')
  async payFromWallet(@Param('id') id: string, @Body() body: { amount: number; orderId?: string }, @Request() req: any) {
    return this.patientsService.payFromWallet(id, body.amount, body.orderId, req.user?.userId, req.user?.branchId);
  }
}
