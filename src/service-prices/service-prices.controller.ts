import { Body, Controller, Get, Param, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { ServicePricesService } from './service-prices.service';
import { UpdateServicePricesDto } from './dto/update-service-prices.dto';

@Controller('service-prices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServicePricesController {
  constructor(private readonly servicePricesService: ServicePricesService) {}

  @Get()
  @Roles(
    UserRoleEnum.ADMIN,
    UserRoleEnum.RECEPTIONIST,
    UserRoleEnum.NURSE,
    UserRoleEnum.DOCTOR,
    UserRoleEnum.SPECIALIST,
  )
  getMyBranchPrices(@Request() req: any) {
    return this.servicePricesService.getEffectivePrices(req.user?.branchId);
  }

  @Get('admin')
  @Roles(UserRoleEnum.ADMIN)
  getAdminBranchPrices(@Query('branchId') branchId?: string) {
    return this.servicePricesService.getEffectivePrices(branchId);
  }

  @Put('admin/:branchId')
  @Roles(UserRoleEnum.ADMIN)
  updateBranchPrices(@Param('branchId') branchId: string, @Body() dto: UpdateServicePricesDto) {
    return this.servicePricesService.updateBranchPrices(branchId, dto);
  }
}
