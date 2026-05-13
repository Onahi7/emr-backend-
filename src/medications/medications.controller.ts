import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { MedicationsService } from './medications.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { MedicationCategoryEnum } from '../database/schemas/medication.schema';

@Controller('medications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MedicationsController {
  constructor(private readonly medicationsService: MedicationsService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.INVENTORY_MANAGER)
  create(@Body() createMedicationDto: CreateMedicationDto) {
    return this.medicationsService.create(createMedicationDto);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  findAll(@Query('category') category?: MedicationCategoryEnum, @Query('lowStock') lowStock?: boolean) {
    if (lowStock) {
      return this.medicationsService.findLowStock();
    }
    const query = category ? { category } : {};
    return this.medicationsService.findAll(query);
  }

  @Get('search')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  search(@Query('q') searchTerm: string) {
    return this.medicationsService.search(searchTerm);
  }

  @Get('report')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.INVENTORY_MANAGER)
  getReport() {
    return this.medicationsService.getInventoryReport();
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  findOne(@Param('id') id: string) {
    return this.medicationsService.findById(id);
  }

  @Get('code/:code')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  findByCode(@Param('code') code: string) {
    return this.medicationsService.findByCode(code);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.INVENTORY_MANAGER)
  update(@Param('id') id: string, @Body() updateMedicationDto: UpdateMedicationDto) {
    return this.medicationsService.update(id, updateMedicationDto);
  }

  @Patch(':id/stock')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.INVENTORY_MANAGER)
  updateStock(
    @Param('id') id: string,
    @Body() body: { quantity: number; operation: 'add' | 'subtract' },
  ) {
    return this.medicationsService.updateStock(id, body.quantity, body.operation);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  deactivate(@Param('id') id: string) {
    return this.medicationsService.deactivate(id);
  }
}
