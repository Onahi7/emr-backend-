import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRoleEnum.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * Preview how many records clearing test data would delete.
   * GET /admin/clear-test-data/preview
   */
  @Get('clear-test-data/preview')
  getClearTestDataPreview() {
    return this.adminService.getClearTestDataPreview();
  }

  /**
   * Permanently delete all transactional/clinical data.
   * Caller must pass `confirmation: "DELETE ALL TEST DATA"`.
   * POST /admin/clear-test-data
   */
  @Post('clear-test-data')
  clearTestData(@Body() body: { confirmation: string }, @Request() req: any) {
    return this.adminService.clearTestData(req.user?.userId, body?.confirmation);
  }

  /**
   * Full admin dashboard — hospital-wide summary for today or a given date
   * GET /admin/dashboard?date=2026-05-10
   */
  @Get('dashboard')
  getDashboard(@Query('date') date?: string) {
    return this.adminService.getDashboard(date);
  }

  @Get('management-kpis')
  getManagementKpis(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getManagementKpis(startDate, endDate);
  }

  /**
   * Revenue report for a date range
   * GET /admin/revenue?startDate=2026-05-01&endDate=2026-05-10
   */
  @Get('revenue')
  getRevenueReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const start = startDate || new Date().toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];
    return this.adminService.getRevenueReport(start, end);
  }

  /**
   * Staff performance report
   * GET /admin/staff-report?startDate=2026-05-01&endDate=2026-05-10
   */
  @Get('staff-report')
  getStaffReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getStaffReport(startDate, endDate);
  }

  /**
   * Patient statistics
   * GET /admin/patient-stats?startDate=2026-04-01&endDate=2026-05-10
   */
  @Get('patient-stats')
  getPatientStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getPatientStats(startDate, endDate);
  }
}
