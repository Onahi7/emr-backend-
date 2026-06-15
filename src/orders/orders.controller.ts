import {
  Controller,
  Delete,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { AssignDoctorDto } from './dto/assign-doctor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { OrderTypeEnum, OrderStatusEnum } from '../database/schemas/order.schema';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  async create(@Body() createOrderDto: CreateOrderDto, @Request() req: any) {
    return this.ordersService.create(createOrderDto, req.user?.userId, req.user?.branchId, req.user?.role);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST)
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('patientId') patientId?: string,
    @Query('visitId') visitId?: string,
    @Query('search') search?: string,
    @Query('orderType') orderType?: OrderTypeEnum,
    @Request() req?: any,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.ordersService.findAll(pageNum, limitNum, status, patientId, visitId, search, orderType, req.user?.branchId);
  }

  /**
   * Get pending clinical orders (awaiting payment)
   * Used by Reception dashboard
   */
  @Get('pending-clinical')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async getPendingClinicalOrders(@Query('orderType') orderType?: OrderTypeEnum, @Request() req?: any) {
    return this.ordersService.getPendingClinicalOrders(orderType, req.user?.branchId);
  }

  /**
   * Get lab queue - paid lab orders ready for processing
   * Used by Lab dashboard
   */
  @Get('lab-queue')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async getLabQueue(@Request() req: any) {
    return this.ordersService.getLabQueue(req.user?.branchId);
  }

  /**
   * Get pharmacy queue - paid pharmacy orders ready for dispensing
   * Used by Pharmacy dashboard
   */
  @Get('pharmacy-queue')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST)
  async getPharmacyQueue(@Request() req: any) {
    return this.ordersService.getPharmacyQueue(req.user?.branchId);
  }

  @Get('pending-collection')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async getPendingCollection(@Request() req: any) {
    return this.ordersService.getPendingCollection(req.user?.branchId);
  }

  @Get('pending-results')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async getPendingResults(@Request() req: any) {
    return this.ordersService.getPendingResults(req.user?.branchId);
  }

  /**
   * Get live LIS orderable tests/panels for doctor ordering UI.
   * EMR should use this as source for lab request selection.
   */
  @Get('lis-catalog')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  async getLisCatalog(@Request() req: any) {
    return this.ordersService.getLisCatalog(req.user?.branchId);
  }

  @Get('stats/payment')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async getPaymentStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Request() req?: any,
  ) {
    return this.ordersService.getPaymentStats(startDate, endDate, req.user?.branchId);
  }

  @Get('stats/daily-income')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async getDailyIncome(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Request() req?: any,
  ) {
    return this.ordersService.getDailyIncome(startDate, endDate, req.user?.branchId);
  }

  @Get('stats/outstanding')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async getOutstandingBalances(@Request() req: any) {
    return this.ordersService.getOutstandingBalances(req.user?.branchId);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.PHARMACIST)
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.findOne(id, req.user?.branchId);
  }

  @Get(':id/tests')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  async getOrderTests(@Param('id') id: string) {
    return this.ordersService.getOrderTests(id);
  }

  @Post(':id/sync-lis')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  async syncToLis(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.syncToLis(id, req.user?.branchId);
  }

  @Post('retry-failed-lis-sync')
  @Roles(UserRoleEnum.ADMIN)
  async retryFailedLisSync(@Request() req: any) {
    return this.ordersService.retryFailedLisSync(req.user?.branchId);
  }

  /**
   * Force-sync payment state for a paid lab order to partner LIS.
   * Useful when an order synced but did not appear in LIS collection queue due to payment sync drift.
   */
  @Post(':id/sync-lis-payment')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async syncLisPayment(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.syncLisPayment(id, req.user?.branchId);
  }

  @Post(':id/fetch-lis-results')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  async fetchLisResults(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.fetchLisResults(id, req.user?.branchId);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.LAB_TECH, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  async update(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @Request() req: any,
  ) {
    return this.ordersService.update(id, updateOrderDto, req.user?.branchId);
  }

  /**
   * Mark order as paid
   * Used by Reception when confirming payment
   */
  @Patch(':id/mark-paid')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async markAsPaid(
    @Param('id') id: string,
    @Body() body: { paymentMethod: string },
    @Request() req: any,
  ) {
    return this.ordersService.markAsPaid(id, body.paymentMethod, req.user?.userId, req.user?.branchId);
  }

  @Post(':id/cancel')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  async cancel(
    @Param('id') id: string,
    @Body() cancelOrderDto: CancelOrderDto,
    @Request() req: any,
  ) {
    return this.ordersService.cancel(id, cancelOrderDto, req.user?.userId, req.user?.branchId);
  }

  @Post(':id/collect')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async collect(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.collect(id, req.user?.userId, req.user?.branchId);
  }

  @Post(':id/payment')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async addPayment(
    @Param('id') id: string,
    @Body() addPaymentDto: AddPaymentDto,
    @Request() req: any,
  ) {
    return this.ordersService.addPayment(id, addPaymentDto, req.user?.userId, req.user?.branchId);
  }

  @Get(':id/payments')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async getPaymentHistory(@Param('id') id: string) {
    return this.ordersService.getPaymentHistory(id);
  }

  @Post(':id/assign-doctor')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async assignDoctor(
    @Param('id') id: string,
    @Body() assignDoctorDto: AssignDoctorDto,
    @Request() req: any,
  ) {
    return this.ordersService.assignDoctor(id, assignDoctorDto, req.user?.branchId);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.remove(id, req.user?.branchId);
  }
}
