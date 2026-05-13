import { IsString, IsBoolean, IsEnum, IsOptional, IsObject } from 'class-validator';

// Define enums locally to avoid circular dependency issues
export enum PaperSize {
  A4 = 'A4',
  LETTER = 'LETTER',
  LEGAL = 'LEGAL',
  A5 = 'A5',
}

export enum Orientation {
  PORTRAIT = 'portrait',
  LANDSCAPE = 'landscape',
}

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsEnum(PaperSize)
  paperSize: PaperSize;

  @IsEnum(Orientation)
  orientation: Orientation;

  @IsObject()
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

  @IsObject()
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

  @IsOptional()
  @IsObject()
  patientSection?: any;

  @IsOptional()
  @IsObject()
  resultsSection?: any;

  @IsOptional()
  @IsObject()
  footer?: any;

  @IsOptional()
  @IsObject()
  styling?: any;
}
