import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TestCatalogService } from './test-catalog.service';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { CreateTestPanelDto } from './dto/create-test-panel.dto';
import { UpdateTestPanelDto } from './dto/update-test-panel.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('test-catalog')
@UseGuards(JwtAuthGuard)
export class TestCatalogController {
  constructor(private readonly testCatalogService: TestCatalogService) {}

  // Test Catalog Endpoints

  @Get()
  async findAllTests(@Query('activeOnly') activeOnly?: string) {
    const active = activeOnly === 'true';
    return this.testCatalogService.findAllTests(active);
  }

  @Get('active')
  async findActiveTests() {
    return this.testCatalogService.findAllTests(true);
  }

  @Get('active-with-panels')
  async findActiveTestsAndPanels() {
    return this.testCatalogService.findActiveTestsAndPanels();
  }

  @Get('category/:category')
  async findTestsByCategory(@Param('category') category: string) {
    return this.testCatalogService.findTestsByCategory(category);
  }

  @Get('machine/:machineId')
  async findTestsByMachine(@Param('machineId') machineId: string) {
    return this.testCatalogService.findTestsByMachine(machineId);
  }

  @Get(':id')
  async findTestById(@Param('id') id: string) {
    return this.testCatalogService.findTestById(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async createTest(@Body() createTestDto: CreateTestDto) {
    return this.testCatalogService.createTest(createTestDto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async updateTest(
    @Param('id') id: string,
    @Body() updateTestDto: UpdateTestDto,
  ) {
    return this.testCatalogService.updateTest(id, updateTestDto);
  }

  @Patch(':id/activate')
  @UseGuards(RolesGuard)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async activateTest(@Param('id') id: string) {
    return this.testCatalogService.activateTest(id);
  }

  @Patch(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async deactivateTest(@Param('id') id: string) {
    return this.testCatalogService.deactivateTest(id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTest(@Param('id') id: string) {
    await this.testCatalogService.deleteTest(id);
  }
}

@Controller('test-panels')
@UseGuards(JwtAuthGuard)
export class TestPanelsController {
  constructor(private readonly testCatalogService: TestCatalogService) {}

  @Get()
  async findAllTestPanels(@Query('activeOnly') activeOnly?: string) {
    const active = activeOnly === 'true';
    return this.testCatalogService.findAllTestPanels(active);
  }

  @Get('active')
  async findActiveTestPanels() {
    return this.testCatalogService.findAllTestPanels(true);
  }

  @Get(':id')
  async findTestPanelById(@Param('id') id: string) {
    return this.testCatalogService.findTestPanelById(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  async createTestPanel(@Body() createTestPanelDto: CreateTestPanelDto) {
    return this.testCatalogService.createTestPanel(createTestPanelDto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  async updateTestPanel(
    @Param('id') id: string,
    @Body() updateTestPanelDto: UpdateTestPanelDto,
  ) {
    return this.testCatalogService.updateTestPanel(id, updateTestPanelDto);
  }

  @Patch(':id/activate')
  @UseGuards(RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  async activateTestPanel(@Param('id') id: string) {
    return this.testCatalogService.activateTestPanel(id);
  }

  @Patch(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  async deactivateTestPanel(@Param('id') id: string) {
    return this.testCatalogService.deactivateTestPanel(id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTestPanel(@Param('id') id: string) {
    await this.testCatalogService.deleteTestPanel(id);
  }
}
