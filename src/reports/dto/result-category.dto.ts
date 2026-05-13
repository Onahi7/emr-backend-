import { IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ResultItemDto } from './result-item.dto';

export class ResultCategoryDto {
  @IsString()
  category: string;

  @IsString()
  categoryDisplayName: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResultItemDto)
  results: ResultItemDto[];
}
