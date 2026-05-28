import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { ReviewReconciliationDto } from './dto/review-reconciliation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get('expected/:date')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async getExpectedAmounts(@Param('date') date: string, @Query('branchId') branchId?: string) {
    return this.reconciliationService.getExpectedAmounts(new Date(date), branchId);
  }

  @Get('daily-report/:date')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async getDailyReport(@Param('date') date: string, @Query('branchId') branchId?: string) {
    return this.reconciliationService.getDailyReport(new Date(date), branchId);
  }

  @Get('doctor-referral-report')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async getDoctorReferralReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('doctor') doctor?: string,
    @Query('doctorId') doctorId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.reconciliationService.getDoctorReferralReport({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      doctor,
      doctorId,
      branchId,
    });
  }

  @Post()
  @Roles(UserRoleEnum.RECEPTIONIST)
  async create(
    @Body() createDto: CreateReconciliationDto,
    @Request() req: any,
    @Query('branchId') branchId?: string,
  ) {
    return this.reconciliationService.create(createDto, req.user?.userId, branchId);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async findAll(@Query('status') status?: string, @Query('branchId') branchId?: string) {
    return this.reconciliationService.findAll(status, branchId);
  }

  @Get('pending/count')
  @Roles(UserRoleEnum.ADMIN)
  async getPendingCount(@Query('branchId') branchId?: string) {
    const count = await this.reconciliationService.getPendingCount(branchId);
    return { count };
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async findOne(@Param('id') id: string, @Query('branchId') branchId?: string) {
    return this.reconciliationService.findOne(id, branchId);
  }

  @Post(':id/review')
  @Roles(UserRoleEnum.ADMIN)
  async review(
    @Param('id') id: string,
    @Body() reviewDto: ReviewReconciliationDto,
    @Request() req: any,
    @Query('branchId') branchId?: string,
  ) {
    return this.reconciliationService.review(id, reviewDto, req.user?.userId, branchId);
  }
}
