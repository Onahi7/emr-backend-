import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Logger } from '@nestjs/common';
import { MedicationsService } from './medications.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { MedicationCategoryEnum } from '../database/schemas/medication.schema';
import { CafIntegrationService } from '../caf-integration/caf-integration.service';

@Controller('medications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MedicationsController {
  private readonly logger = new Logger(MedicationsController.name);
  constructor(
    private readonly medicationsService: MedicationsService,
    private readonly cafIntegrationService: CafIntegrationService,
  ) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.INVENTORY_MANAGER)
  create(@Body() createMedicationDto: CreateMedicationDto) {
    return this.medicationsService.create(createMedicationDto);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  async findAll(@Query('category') category?: MedicationCategoryEnum, @Query('lowStock') lowStock?: boolean) {
    if (lowStock) {
      return this.medicationsService.findLowStock();
    }
    const query = category ? { category } : {};
    const localMeds = await this.medicationsService.findAll(query);

    // Merge CAF products when configured
    if (this.cafIntegrationService.isConfigured()) {
      try {
        let cafProducts = await this.cafIntegrationService.getProducts({ category, page: 1, limit: 500 });
        if (!cafProducts || cafProducts.length === 0) {
          this.logger.warn('CAF getProducts returned 0 results, trying search fallback');
          cafProducts = await this.cafIntegrationService.searchProducts('a');
        }
        const cafMeds = cafProducts.map((p) => ({
          _id: p._id,
          medicationCode: p.sku,
          name: p.name,
          genericName: p.brand,
          category: p.category,
          stockQuantity: p.quantityAvailable,
          unitPrice: p.suggestedRetailPrice || p.basePrice,
          unit: p.unit,
          isActive: p.isActive,
          dosageForm: p.unit,
          strength: p.packSizes?.[0]?.name || '',
          packSizes: p.packSizes?.map((ps) => ({
            name: ps.name,
            unit: ps.unit,
            quantityPerPack: ps.quantityPerPack,
            sellingPrice: ps.sellingPrice,
          })) || [],
          __cafProduct: true,
          __cafBranchId: this.cafIntegrationService.getBranchId(),
        }));
        this.logger.log(`Loaded ${cafMeds.length} CAF products`);
        return [...cafMeds, ...localMeds];
      } catch (error: any) {
        this.logger.warn(`CAF products unavailable for medication list: ${error.message}`);
      }
    }
    return localMeds;
  }

  @Get('search')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  async search(@Query('q') searchTerm: string) {
    const localResults = await this.medicationsService.search(searchTerm);

    if (this.cafIntegrationService.isConfigured()) {
      try {
        const cafProducts = await this.cafIntegrationService.searchProducts(searchTerm);
        if (cafProducts.length > 0) {
          const cafMeds = cafProducts.map((p) => ({
            _id: p._id,
            medicationCode: p.sku,
            name: p.name,
            genericName: p.brand,
            category: p.category,
            stockQuantity: p.quantityAvailable,
            unitPrice: p.suggestedRetailPrice || p.basePrice,
            unit: p.unit,
            isActive: p.isActive,
            dosageForm: p.unit,
            strength: p.packSizes?.[0]?.name || '',
            packSizes: p.packSizes?.map((ps) => ({
              name: ps.name,
              unit: ps.unit,
              quantityPerPack: ps.quantityPerPack,
              sellingPrice: ps.sellingPrice,
            })) || [],
            __cafProduct: true,
            __cafBranchId: this.cafIntegrationService.getBranchId(),
          }));
          this.logger.log(`Search merged ${cafMeds.length} CAF + ${localResults.length} local results for "${searchTerm}"`);
          return [...cafMeds, ...localResults];
        }
      } catch (error: any) {
        this.logger.warn(`CAF search unavailable, returning local only: ${error.message}`);
      }
    }
    return localResults;
  }

  @Get('caf-products')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST)
  async listCafProducts(
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.cafIntegrationService.getProducts({ search, category });
  }

  @Get('caf-status')
  @Roles(UserRoleEnum.ADMIN)
  async cafStatus() {
    const config = this.cafIntegrationService.getConfigStatus();
    let testResult: string | null = null;
    if (config.configured) {
      try {
        const products = await this.cafIntegrationService.getProducts({ page: 1, limit: 5 });
        testResult = `Fetched ${products.length} products successfully`;
      } catch (error: any) {
        testResult = `Error: ${error.message}`;
      }
    }
    return { ...config, testResult };
  }

  @Get('report')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.INVENTORY_MANAGER)
  getReport() {
    return this.medicationsService.getInventoryReport();
  }

  @Get('code/:code')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  findByCode(@Param('code') code: string) {
    return this.medicationsService.findByCode(code);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE)
  findOne(@Param('id') id: string) {
    return this.medicationsService.findById(id);
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
