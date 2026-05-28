import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MedicationsService } from './medications.service';
import { MedicationsController } from './medications.controller';
import { Medication, MedicationSchema } from '../database/schemas/medication.schema';
import { CafIntegrationModule } from '../caf-integration/caf-integration.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Medication.name, schema: MedicationSchema },
    ]),
    CafIntegrationModule,
  ],
  controllers: [MedicationsController],
  providers: [MedicationsService],
  exports: [MedicationsService],
})
export class MedicationsModule {}
