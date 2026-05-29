import { Controller, Get, Query, UseGuards, Param, Req } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { LabResultReportDto } from './dto/lab-result-report.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @Roles(UserRoleEnum.ADMIN)
  async getDashboardStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.reportsService.getDashboardStats(start, end);
  }

  @Get('test-volume')
  @Roles(UserRoleEnum.ADMIN)
  async getTestVolumeReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.reportsService.getTestVolumeReport(start, end);
  }

  @Get('turnaround-time')
  @Roles(UserRoleEnum.ADMIN)
  async getTurnaroundTimeReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.reportsService.getTurnaroundTimeReport(start, end);
  }

  @Get('revenue')
  @Roles(UserRoleEnum.ADMIN)
  async getRevenueReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.reportsService.getRevenueReport(start, end);
  }

  @Get('machine-utilization')
  @Roles(UserRoleEnum.ADMIN)
  async getMachineUtilizationReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.reportsService.getMachineUtilizationReport(start, end);
  }

  @Get('test-distribution')
  @Roles(UserRoleEnum.ADMIN)
  async getTestDistributionByCategory(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.reportsService.getTestDistributionByCategory(start, end);
  }

  /**
   * Get lab result report for an order
   * 
   * Generates a comprehensive, printable lab results report including:
   * - Patient demographics and order information
   * - Test results grouped by category with visual flags
   * - Verification information and signatures
   * - Laboratory branding and legal disclaimers
   * 
   * @param orderId - MongoDB ObjectId of the order
   * @param req - Express request object (contains authenticated user)
   * @returns Formatted lab result report DTO
   * 
   * @throws {BadRequestException} If order ID is invalid or no verified results exist
   * @throws {NotFoundException} If order is not found
   * @throws {UnauthorizedException} If user is not authenticated
   * @throws {ForbiddenException} If user lacks required role
   * 
   * @example
   * GET /api/reports/lab-results/507f1f77bcf86cd799439011
   * 
   * @security JWT authentication required
   * @roles Admin, Lab Technician, Doctor
   */
  @Get('lab-results/:orderId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.RECEPTIONIST, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST)
  async getLabResultReport(
    @Param('orderId') orderId: string,
    @Req() req: any,
  ): Promise<LabResultReportDto> {
    const userId = req.user?.userId;
    return this.reportsService.generateLabResultReport(orderId, userId);
  }
}
