import { IsString, IsEnum, IsNotEmpty, IsMongoId } from 'class-validator';
import { SampleTypeEnum } from '../../database/schemas/sample.schema';

export class CreateSampleDto {
  @IsMongoId()
  @IsNotEmpty()
  orderId!: string;

  @IsMongoId()
  @IsNotEmpty()
  patientId!: string;

  @IsEnum(SampleTypeEnum)
  @IsNotEmpty()
  sampleType!: SampleTypeEnum;
}
