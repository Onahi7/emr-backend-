import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ReportTemplate, ReportTemplateDocument } from '../database/schemas/report-template.schema';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class ReportTemplatesService {
  private readonly logger = new Logger(ReportTemplatesService.name);

  constructor(
    @InjectModel(ReportTemplate.name)
    private templateModel: Model<ReportTemplateDocument>,
  ) {}

  async create(createDto: CreateTemplateDto): Promise<ReportTemplateDocument> {
    // If setting as default, unset other defaults
    if (createDto.isDefault) {
      await this.templateModel.updateMany({}, { isDefault: false });
    }

    const template = new this.templateModel(createDto);
    await template.save();
    
    this.logger.log(`Template created: ${template.name}`);
    return template;
  }

  async findAll(): Promise<ReportTemplateDocument[]> {
    return this.templateModel.find().sort({ isDefault: -1, name: 1 }).exec();
  }

  async findDefault(): Promise<ReportTemplateDocument> {
    let template = await this.templateModel.findOne({ isDefault: true }).exec();
    
    // If no default, get first active template
    if (!template) {
      template = await this.templateModel.findOne({ isActive: true }).exec();
    }
    
    // If still no template, create default
    if (!template) {
      const defaultTemplate = await this.createDefaultTemplate();
      return defaultTemplate;
    }
    
    return template;
  }

  async findOne(id: string): Promise<ReportTemplateDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    const template = await this.templateModel.findById(id).exec();
    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    return template;
  }

  async update(id: string, updateDto: UpdateTemplateDto): Promise<ReportTemplateDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    // If setting as default, unset other defaults
    if (updateDto.isDefault) {
      await this.templateModel.updateMany({ _id: { $ne: id } }, { isDefault: false });
    }

    const template = await this.templateModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();

    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    this.logger.log(`Template updated: ${template.name}`);
    return template;
  }

  async delete(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    const template = await this.templateModel.findById(id).exec();
    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    if (template.isDefault) {
      throw new BadRequestException('Cannot delete the default template');
    }

    await this.templateModel.findByIdAndDelete(id).exec();
    this.logger.log(`Template deleted: ${template.name}`);
  }

  async setDefault(id: string): Promise<ReportTemplateDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    // Unset all defaults
    await this.templateModel.updateMany({}, { isDefault: false });

    // Set this one as default
    const template = await this.templateModel
      .findByIdAndUpdate(id, { isDefault: true }, { new: true })
      .exec();

    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    this.logger.log(`Template set as default: ${template.name}`);
    return template;
  }

  private async createDefaultTemplate(): Promise<ReportTemplateDocument> {
    const defaultTemplate = new this.templateModel({
      name: 'Default Template',
      isDefault: true,
      isActive: true,
      paperSize: 'A4',
      orientation: 'portrait',
      margins: { top: 15, right: 15, bottom: 15, left: 15 },
      header: {
        showLogo: true,
        logoWidth: 120,
        logoHeight: 80,
        labName: 'Laboratory Name',
        motto: 'Motto: Automated Precision...',
        address: 'Laboratory Address',
        phone: 'Phone Number',
        email: 'email@lab.com',
        showHeaderBorder: true,
        headerBorderColor: '#1e40af',
      },
      patientSection: {
        showDoctor: true,
        showCopiesTo: true,
        showCollectionDate: true,
        showReceivedDate: true,
        showReportedDate: true,
        showPrintedDate: true,
        backgroundColor: '#f9fafb',
      },
      resultsSection: {
        groupByCategory: true,
        showCategoryHeaders: true,
        categoryHeaderColor: '#dbeafe',
        showReferenceRanges: true,
        showUnits: true,
        showFlags: true,
        highlightAbnormal: true,
        abnormalColor: '#ef4444',
        criticalColor: '#dc2626',
        tableHeaderColor: '#f3f4f6',
        alternateRowColors: true,
      },
      footer: {
        showDisclaimer: true,
        disclaimerText: 'All tests conducted using calibrated, automated analyzers with high accuracy and precision. Please consult your healthcare provider for detailed interpretation.',
        showVerification: true,
        showSignatureLines: true,
        showStamp: true,
        showWaveDesign: true,
        waveColor1: '#1e40af',
        waveColor2: '#10b981',
        footerText: 'OPEN 24/7 | ONSITE & ONLINE ACCESS | TRUSTED BY CLINICS & HOSPITALS',
        showPageNumbers: false,
      },
      styling: {
        primaryColor: '#1e40af',
        secondaryColor: '#10b981',
        textColor: '#111827',
        fontFamily: 'Arial, sans-serif',
        fontSize: 12,
        headerFontSize: 16,
      },
    });

    await defaultTemplate.save();
    this.logger.log('Default template created');
    return defaultTemplate;
  }
}
