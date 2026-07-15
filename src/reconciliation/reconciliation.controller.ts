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
  async getExpectedAmounts(@Param('date') date: string, @Request() req: any) {
    return this.reconciliationService.getExpectedAmounts(new Date(date), req.user?.branchId);
  }

  @Get('daily-report/:date')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async getDailyReport(@Param('date') date: string, @Request() req: any) {
    return this.reconciliationService.getDailyReport(new Date(date), req.user?.branchId);
  }

  @Get('doctor-referral-report')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async getDoctorReferralReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('doctor') doctor?: string,
    @Query('doctorId') doctorId?: string,
    @Request() req?: any,
  ) {
    return this.reconciliationService.getDoctorReferralReport({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      doctor,
      doctorId,
      branchId: req.user?.branchId,
    });
  }

  @Post()
  @Roles(UserRoleEnum.RECEPTIONIST)
  async create(
    @Body() createDto: CreateReconciliationDto,
    @Request() req: any,
  ) {
    return this.reconciliationService.create(createDto, req.user?.userId, req.user?.branchId);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async findAll(@Query('status') status?: string, @Request() req?: any) {
    return this.reconciliationService.findAll(status, req.user?.branchId);
  }

  @Get('pending/count')
  @Roles(UserRoleEnum.ADMIN)
  async getPendingCount(@Request() req: any) {
    const count = await this.reconciliationService.getPendingCount(req.user?.branchId);
    return { count };
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.reconciliationService.findOne(id, req.user?.branchId);
  }

  @Post(':id/review')
  @Roles(UserRoleEnum.ADMIN)
  async review(
    @Param('id') id: string,
    @Body() reviewDto: ReviewReconciliationDto,
    @Request() req: any,
  ) {
    return this.reconciliationService.review(id, reviewDto, req.user?.userId, req.user?.branchId);
  }
}
