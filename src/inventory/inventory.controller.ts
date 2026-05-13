import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ---------- Dashboard ----------
  @Get('dashboard')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.PHARMACIST)
  getDashboard() {
    return this.inventoryService.getDashboard();
  }

  @Get('low-stock')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.PHARMACIST)
  getLowStock() {
    return this.inventoryService.getLowStockItems();
  }

  @Get('expiring-soon')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.PHARMACIST)
  getExpiringSoon(@Query('days') days?: string) {
    return this.inventoryService.getExpiringSoon(days ? parseInt(days) : 90);
  }

  // ---------- Stock Movements ----------
  @Get('movements')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.PHARMACIST)
  getMovements(
    @Query('medicationId') medicationId?: string,
    @Query('movementType') movementType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.getMovements({
      medicationId,
      movementType,
      startDate,
      endDate,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Post('receipts')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.INVENTORY_MANAGER)
  receiveStock(@Body() dto: any, @Request() req: any) {
    return this.inventoryService.receiveStock(dto, req.user?.userId);
  }

  @Post('adjustments')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.INVENTORY_MANAGER)
  adjustStock(@Body() dto: any, @Request() req: any) {
    return this.inventoryService.adjustStock(dto, req.user?.userId);
  }

  @Post('expired')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.INVENTORY_MANAGER)
  removeExpired(
    @Body() body: { medicationId: string; quantity: number; reason: string },
    @Request() req: any,
  ) {
    return this.inventoryService.removeExpired(body.medicationId, body.quantity, body.reason, req.user?.userId);
  }

  // ---------- Suppliers ----------
  @Get('suppliers')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.PHARMACIST)
  listSuppliers(@Query('activeOnly') activeOnly?: string) {
    return this.inventoryService.listSuppliers(activeOnly !== 'false');
  }

  @Post('suppliers')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.INVENTORY_MANAGER)
  createSupplier(@Body() data: any) {
    return this.inventoryService.createSupplier(data);
  }

  @Patch('suppliers/:id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.INVENTORY_MANAGER)
  updateSupplier(@Param('id') id: string, @Body() data: any) {
    return this.inventoryService.updateSupplier(id, data);
  }
}
