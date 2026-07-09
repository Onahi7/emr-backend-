import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InsuranceProgram, InsuranceProgramSchema, InsuranceSubEntity, InsuranceSubEntitySchema } from '../database/schemas/insurance.schema';
import { InsuranceService } from './insurance.service';
import { InsuranceController } from './insurance.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InsuranceProgram.name, schema: InsuranceProgramSchema },
      { name: InsuranceSubEntity.name, schema: InsuranceSubEntitySchema },
    ]),
  ],
  controllers: [InsuranceController],
  providers: [InsuranceService],
  exports: [InsuranceService],
})
export class InsuranceModule {}
