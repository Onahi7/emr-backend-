import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument } from 'mongoose';

export enum PaperSizeEnum {
  A4 = 'A4',
  LETTER = 'LETTER',
  LEGAL = 'LEGAL',
  A5 = 'A5',
}

export enum OrientationEnum {
  PORTRAIT = 'portrait',
  LANDSCAPE = 'landscape',
}

@Schema({ timestamps: true, collection: 'report_templates' })
export class ReportTemplate {
  @Prop({ required: true })
  name: string;

  @Prop({ default: false })
  isDefault: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ required: true, enum: Object.values(PaperSizeEnum), default: PaperSizeEnum.A4 })
  paperSize: PaperSizeEnum;

  @Prop({ required: true, enum: Object.values(OrientationEnum), default: OrientationEnum.PORTRAIT })
  orientation: OrientationEnum;

  @Prop({ type: Object, default: { top: 15, right: 15, bottom: 15, left: 15 } })
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

  @Prop({ type: Object, required: true })
  header: {
    showLogo: boolean;
    logoUrl?: string;
    logoWidth?: number;
    logoHeight?: number;
    labName: string;
    tagline?: string;
    motto?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    licenseNumber?: string;
    showHeaderBorder: boolean;
    headerBorderColor?: string;
    headerBackgroundColor?: string;
  };

  @Prop({ type: Object, default: {} })
  patientSection: {
    showDoctor: boolean;
    showCopiesTo: boolean;
    showCollectionDate: boolean;
    showReceivedDate: boolean;
    showReportedDate: boolean;
    showPrintedDate: boolean;
    backgroundColor?: string;
  };

  @Prop({ type: Object, default: {} })
  resultsSection: {
    groupByCategory: boolean;
    showCategoryHeaders: boolean;
    categoryHeaderColor?: string;
    showReferenceRanges: boolean;
    showUnits: boolean;
    showFlags: boolean;
    highlightAbnormal: boolean;
    abnormalColor?: string;
    criticalColor?: string;
    tableHeaderColor?: string;
    alternateRowColors: boolean;
  };

  @Prop({ type: Object, default: {} })
  footer: {
    showDisclaimer: boolean;
    disclaimerText?: string;
    showVerification: boolean;
    showSignatureLines: boolean;
    showStamp: boolean;
    showWaveDesign: boolean;
    waveColor1?: string;
    waveColor2?: string;
    footerText?: string;
    showPageNumbers: boolean;
  };

  @Prop({ type: Object, default: {} })
  styling: {
    primaryColor?: string;
    secondaryColor?: string;
    textColor?: string;
    fontFamily?: string;
    fontSize?: number;
    headerFontSize?: number;
  };

  @Prop({ type: [String], default: [] })
  customFields: string[];

  createdAt: Date;
  updatedAt: Date;
}

export const ReportTemplateSchema = SchemaFactory.createForClass(ReportTemplate);

ReportTemplateSchema.index({ name: 1 }, { unique: true });
ReportTemplateSchema.index({ isDefault: 1 });
ReportTemplateSchema.index({ isActive: 1 });

export type ReportTemplateDocument = HydratedDocument<ReportTemplate>;
