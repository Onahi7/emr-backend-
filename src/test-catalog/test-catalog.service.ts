import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TestCatalog } from '../database/schemas/test-catalog.schema';
import { TestPanel } from '../database/schemas/test-panel.schema';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { CreateTestPanelDto } from './dto/create-test-panel.dto';
import { UpdateTestPanelDto } from './dto/update-test-panel.dto';

@Injectable()
export class TestCatalogService {
  constructor(
    @InjectModel(TestCatalog.name)
    private testCatalogModel: Model<TestCatalog>,
    @InjectModel(TestPanel.name)
    private testPanelModel: Model<TestPanel>,
  ) {}

  // Test Catalog Methods

  async createTest(createTestDto: CreateTestDto): Promise<TestCatalog> {
    // Check if test code already exists
    const existingTest = await this.testCatalogModel.findOne({
      code: createTestDto.code,
    });

    if (existingTest) {
      throw new ConflictException(
        `Test with code ${createTestDto.code} already exists`,
      );
    }

    // Validate machineId if provided
    if (createTestDto.machineId) {
      if (!Types.ObjectId.isValid(createTestDto.machineId)) {
        throw new BadRequestException('Invalid machine ID format');
      }
    }

    const test = new this.testCatalogModel({
      ...createTestDto,
      machineId: createTestDto.machineId
        ? new Types.ObjectId(createTestDto.machineId)
        : undefined,
      isActive: createTestDto.isActive !== undefined ? createTestDto.isActive : true,
    });

    return test.save();
  }

  async findAllTests(activeOnly: boolean = false): Promise<TestCatalog[]> {
    const filter = activeOnly ? { isActive: true } : {};
    return this.testCatalogModel
      .find(filter)
      .populate('machineId', 'name manufacturer model')
      .sort({ category: 1, name: 1 })
      .exec();
  }

  async findActiveTestsAndPanels(): Promise<any[]> {
    const tests = await this.testCatalogModel
      .find({ isActive: true })
      .populate('machineId', 'name manufacturer model')
      .sort({ category: 1, name: 1 })
      .exec();

    const panels = await this.testPanelModel
      .find({ isActive: true })
      .sort({ name: 1 })
      .exec();

    const panelTestCodes = panels.flatMap(p =>
      (p.tests || []).map((t: any) => t.testCode),
    );
    const activeTestCodes = new Set(tests.map(t => t.code));
    const missingCodes = panelTestCodes.filter(c => c && !activeTestCodes.has(c));

    // Panel codes - tests whose code matches a panel code should be excluded
    // from standalone tests to avoid duplicates (e.g. LIPID exists as both a
    // test_catalog entry AND a test_panels panel)
    const panelCodes = new Set(panels.map(p => p.code));
    const filteredTests = tests.filter(t => !panelCodes.has(t.code));

    let panelComponentTests: TestCatalog[] = [];
    if (missingCodes.length > 0) {
      panelComponentTests = await this.testCatalogModel
        .find({ code: { $in: missingCodes }, isActive: false })
        .populate('machineId', 'name manufacturer model')
        .sort({ category: 1, name: 1 })
        .exec();
    }

    const transformedPanels = panels.map(panel => ({
      _id: panel._id,
      id: panel._id.toString(),
      code: panel.code,
      name: panel.name,
      category: 'panel',
      price: panel.price,
      isActive: panel.isActive,
      description: panel.description,
      sampleType: 'blood',
      turnaroundTime: 180,
      isPanel: true,
      tests: panel.tests,
    }));

    return [...filteredTests, ...panelComponentTests, ...transformedPanels];
  }

  async findTestById(id: string): Promise<TestCatalog> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid test ID format');
    }

    const test = await this.testCatalogModel
      .findById(id)
      .populate('machineId', 'name manufacturer model')
      .exec();

    if (!test) {
      throw new NotFoundException(`Test with ID ${id} not found`);
    }

    return test;
  }

  async findTestByCode(code: string): Promise<TestCatalog> {
    const test = await this.testCatalogModel
      .findOne({ code })
      .populate('machineId', 'name manufacturer model')
      .exec();

    if (!test) {
      throw new NotFoundException(`Test with code ${code} not found`);
    }

    return test;
  }

  async updateTest(
    id: string,
    updateTestDto: UpdateTestDto,
  ): Promise<TestCatalog> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid test ID format');
    }

    // Check if test exists
    const existingTest = await this.testCatalogModel.findById(id);
    if (!existingTest) {
      throw new NotFoundException(`Test with ID ${id} not found`);
    }

    // Check if code is being changed and if new code already exists
    if (updateTestDto.code && updateTestDto.code !== existingTest.code) {
      const duplicateTest = await this.testCatalogModel.findOne({
        code: updateTestDto.code,
        _id: { $ne: id },
      });

      if (duplicateTest) {
        throw new ConflictException(
          `Test with code ${updateTestDto.code} already exists`,
        );
      }
    }

    // Validate machineId if provided
    if (updateTestDto.machineId) {
      if (!Types.ObjectId.isValid(updateTestDto.machineId)) {
        throw new BadRequestException('Invalid machine ID format');
      }
    }

    const updateData: any = { ...updateTestDto };
    if (updateTestDto.machineId) {
      updateData.machineId = new Types.ObjectId(updateTestDto.machineId);
    }

    const updatedTest = await this.testCatalogModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate('machineId', 'name manufacturer model')
      .exec();

    if (!updatedTest) {
      throw new NotFoundException(`Test with ID ${id} not found`);
    }

    return updatedTest;
  }

  async deleteTest(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid test ID format');
    }

    const result = await this.testCatalogModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Test with ID ${id} not found`);
    }
  }

  async activateTest(id: string): Promise<TestCatalog> {
    return this.updateTest(id, { isActive: true });
  }

  async deactivateTest(id: string): Promise<TestCatalog> {
    return this.updateTest(id, { isActive: false });
  }

  async findTestsByCategory(category: string): Promise<TestCatalog[]> {
    return this.testCatalogModel
      .find({ category, isActive: true })
      .populate('machineId', 'name manufacturer model')
      .sort({ name: 1 })
      .exec();
  }

  async findTestsByMachine(machineId: string): Promise<TestCatalog[]> {
    if (!Types.ObjectId.isValid(machineId)) {
      throw new BadRequestException('Invalid machine ID format');
    }

    return this.testCatalogModel
      .find({ machineId: new Types.ObjectId(machineId), isActive: true })
      .sort({ name: 1 })
      .exec();
  }

  // Test Panel Methods

  async createTestPanel(
    createTestPanelDto: CreateTestPanelDto,
  ): Promise<TestPanel> {
    // Check if panel code already exists
    const existingPanel = await this.testPanelModel.findOne({
      code: createTestPanelDto.code,
    });

    if (existingPanel) {
      throw new ConflictException(
        `Test panel with code ${createTestPanelDto.code} already exists`,
      );
    }

    // Validate all test IDs
    const testIds = createTestPanelDto.testIds.map((id) => {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException(`Invalid test ID format: ${id}`);
      }
      return new Types.ObjectId(id);
    });

    // Fetch all tests to build the panel
    const tests = await this.testCatalogModel
      .find({ _id: { $in: testIds } })
      .exec();

    if (tests.length !== testIds.length) {
      throw new BadRequestException(
        'One or more test IDs are invalid or do not exist',
      );
    }

    // Build test panel items
    const panelTests = tests.map((test) => ({
      testId: test._id,
      testCode: test.code,
      testName: test.name,
    }));

    const panel = new this.testPanelModel({
      code: createTestPanelDto.code,
      name: createTestPanelDto.name,
      description: createTestPanelDto.description,
      price: createTestPanelDto.price,
      isActive: createTestPanelDto.isActive !== undefined ? createTestPanelDto.isActive : true,
      tests: panelTests,
    });

    return panel.save();
  }

  async findAllTestPanels(activeOnly: boolean = false): Promise<TestPanel[]> {
    const filter = activeOnly ? { isActive: true } : {};
    return this.testPanelModel
      .find(filter)
      .populate('tests.testId', 'code name category price')
      .sort({ name: 1 })
      .exec();
  }

  async findTestPanelById(id: string): Promise<TestPanel> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid test panel ID format');
    }

    const panel = await this.testPanelModel
      .findById(id)
      .populate('tests.testId', 'code name category price')
      .exec();

    if (!panel) {
      throw new NotFoundException(`Test panel with ID ${id} not found`);
    }

    return panel;
  }

  async findTestPanelByCode(code: string): Promise<TestPanel> {
    const panel = await this.testPanelModel
      .findOne({ code })
      .populate('tests.testId', 'code name category price')
      .exec();

    if (!panel) {
      throw new NotFoundException(`Test panel with code ${code} not found`);
    }

    return panel;
  }

  async updateTestPanel(
    id: string,
    updateTestPanelDto: UpdateTestPanelDto,
  ): Promise<TestPanel> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid test panel ID format');
    }

    // Check if panel exists
    const existingPanel = await this.testPanelModel.findById(id);
    if (!existingPanel) {
      throw new NotFoundException(`Test panel with ID ${id} not found`);
    }

    // Check if code is being changed and if new code already exists
    if (updateTestPanelDto.code && updateTestPanelDto.code !== existingPanel.code) {
      const duplicatePanel = await this.testPanelModel.findOne({
        code: updateTestPanelDto.code,
        _id: { $ne: id },
      });

      if (duplicatePanel) {
        throw new ConflictException(
          `Test panel with code ${updateTestPanelDto.code} already exists`,
        );
      }
    }

    const updateData: any = {
      code: updateTestPanelDto.code,
      name: updateTestPanelDto.name,
      description: updateTestPanelDto.description,
      price: updateTestPanelDto.price,
      isActive: updateTestPanelDto.isActive,
    };

    // If testIds are being updated, rebuild the tests array
    if (updateTestPanelDto.testIds) {
      const testIds = updateTestPanelDto.testIds.map((id) => {
        if (!Types.ObjectId.isValid(id)) {
          throw new BadRequestException(`Invalid test ID format: ${id}`);
        }
        return new Types.ObjectId(id);
      });

      const tests = await this.testCatalogModel
        .find({ _id: { $in: testIds } })
        .exec();

      if (tests.length !== testIds.length) {
        throw new BadRequestException(
          'One or more test IDs are invalid or do not exist',
        );
      }

      updateData.tests = tests.map((test) => ({
        testId: test._id,
        testCode: test.code,
        testName: test.name,
      }));
    }

    const updatedPanel = await this.testPanelModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate('tests.testId', 'code name category price')
      .exec();

    if (!updatedPanel) {
      throw new NotFoundException(`Test panel with ID ${id} not found`);
    }

    return updatedPanel;
  }

  async deleteTestPanel(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid test panel ID format');
    }

    const result = await this.testPanelModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Test panel with ID ${id} not found`);
    }
  }

  async activateTestPanel(id: string): Promise<TestPanel> {
    return this.updateTestPanel(id, { isActive: true });
  }

  async deactivateTestPanel(id: string): Promise<TestPanel> {
    return this.updateTestPanel(id, { isActive: false });
  }
}
