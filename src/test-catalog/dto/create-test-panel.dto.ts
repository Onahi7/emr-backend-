import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, Min, ArrayMinSize } from 'class-validator';

export class CreateTestPanelDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  testIds: string[];

  @IsNumber()
  @Min(0)
  price: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
