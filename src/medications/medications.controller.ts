import { BadRequestException, Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Logger, Request } from '@nestjs/common';
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

  private normalizeCafMedication(p: any, branchId?: string) {
    const stockQuantity =
      Number(p.quantityAvailable ?? p.stockAvailable ?? p.stock ?? p.calculatedStock ?? p.availableStock ?? p.stockQuantity ?? 0) || 0;
    const defaultPack = p.packSizes?.[0];
    const perBaseUnitPrice =
      defaultPack && defaultPack.quantityPerPack > 0
        ? (defaultPack.sellingPrice || 0) / defaultPack.quantityPerPack
        : (p.suggestedRetailPrice || p.sellingPrice || p.price || p.basePrice || 0);

    return {
      _id: p._id,
      medicationCode: p.sku,
      name: p.name,
      genericName: p.brand,
      category: p.category,
      stockQuantity,
      quantityAvailable: stockQuantity,
      stockAvailable: stockQuantity,
      stock: stockQuantity,
      unit: p.unit,
      unitPrice: perBaseUnitPrice,
      baseUnit: p.unit || 'unit',
      sellMode: p.packSizes && p.packSizes.length > 0 ? 'both' : 'individual',
      isActive: p.isActive,
      dosageForm: p.unit,
      strength: p.packSizes?.[0]?.name || '',
      packSizes: p.packSizes?.map((ps) => ({
        name: ps.name,
        unit: ps.unit,
        unitsPerPack: ps.unitsPerPack ?? ps.quantityPerPack,
        quantityPerPack: ps.quantityPerPack ?? ps.unitsPerPack,
        sellingPrice: ps.sellingPrice,
        barcode: ps.barcode,
      })) || [],
      isCafSourced: true,
      cafProductId: p._id,
      __cafProduct: true,
      __cafBranchId: branchId,
    };
  }

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.INVENTORY_MANAGER)
  create(@Body() createMedicationDto: CreateMedicationDto) {
    return this.medicationsService.create(createMedicationDto);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  async findAll(@Query('category') category: MedicationCategoryEnum | undefined, @Query('lowStock') lowStock: boolean | undefined, @Request() req: any) {
    const branchId = req.user?.branchId;
    if (lowStock) {
      return this.medicationsService.findLowStock();
    }
    const query = category ? { category } : {};
    const localMeds = await this.medicationsService.findAll(query);

    // Merge CAF products when configured
    if (await this.cafIntegrationService.isConfiguredForBranch(branchId)) {
      try {
        const cafParams: any = { page: 1, limit: 500 };
        if (category) cafParams.category = category;
        cafParams.branchId = branchId;
        let cafProducts = await this.cafIntegrationService.getProducts(cafParams);
        if (!cafProducts || cafProducts.length === 0) {
          this.logger.warn('CAF getProducts returned 0 results, trying search fallback');
          cafProducts = await this.cafIntegrationService.searchProducts('a', branchId);
        }
        const cafMeds = cafProducts.map((p) => this.normalizeCafMedication(p, branchId));
        this.logger.log(`Loaded ${cafMeds.length} CAF products`);
        return [...cafMeds, ...localMeds];
      } catch (error: any) {
        this.logger.warn(`CAF products unavailable for medication list: ${error.message}`);
      }
    }
    return localMeds;
  }

  @Get('search')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  async search(@Query('q') searchTerm: string, @Request() req: any) {
    if (typeof searchTerm !== 'string' || !searchTerm.trim()) {
      throw new BadRequestException('Search query q is required');
    }
    const branchId = req.user?.branchId;
    const normalizedSearchTerm = searchTerm.trim();
    const localResults = await this.medicationsService.search(normalizedSearchTerm);

    if (await this.cafIntegrationService.isConfiguredForBranch(branchId)) {
      try {
        const cafProducts = await this.cafIntegrationService.searchProducts(normalizedSearchTerm, branchId);
        if (cafProducts.length > 0) {
          const cafMeds = cafProducts.map((p) => this.normalizeCafMedication(p, branchId));
          this.logger.log(`Search merged ${cafMeds.length} CAF + ${localResults.length} local results for "${normalizedSearchTerm}"`);
          return [...cafMeds, ...localResults];
        }
      } catch (error: any) {
        this.logger.warn(`CAF search unavailable, returning local only: ${error.message}`);
      }
    }
    return localResults;
  }

  @Get('caf-products')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  async listCafProducts(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Request() req?: any,
  ) {
    return this.cafIntegrationService.getProducts({ search, category, branchId: req.user?.branchId });
  }

  @Get('caf-status')
  @Roles(UserRoleEnum.ADMIN)
  async cafStatus() {
    const config = this.cafIntegrationService.getConfigStatus();
    let testResult: string | null = null;
    let rawResponse: any = null;
    if (config.configured) {
      try {
        const result = await this.cafIntegrationService.getProductsDebug({ page: 1, limit: 5 });
        testResult = `Fetched ${result.products.length} products successfully`;
        rawResponse = result.raw;
      } catch (error: any) {
        testResult = `Error: ${error.message}`;
      }
    }
    return { ...config, testResult, rawResponse };
  }

  @Get('report')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.INVENTORY_MANAGER)
  getReport() {
    return this.medicationsService.getInventoryReport();
  }

  @Get('code/:code')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  findByCode(@Param('code') code: string) {
    return this.medicationsService.findByCode(code);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.PHARMACIST, UserRoleEnum.INVENTORY_MANAGER, UserRoleEnum.DOCTOR, UserRoleEnum.SPECIALIST, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  async findOne(@Param('id') id: string, @Request() req: any) {
    try {
      return await this.medicationsService.findById(id);
    } catch (error) {
      if (await this.cafIntegrationService.isConfiguredForBranch(req.user?.branchId)) {
        const product = await this.cafIntegrationService.getProductById(id, req.user?.branchId);
        if (product) return this.normalizeCafMedication(product, req.user?.branchId);
      }
      throw error;
    }
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
