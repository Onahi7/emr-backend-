import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsController } from './prescriptions.controller';
import { Prescription, PrescriptionSchema } from '../database/schemas/prescription.schema';
import { Medication, MedicationSchema } from '../database/schemas/medication.schema';
import { StockMovement, StockMovementSchema } from '../database/schemas/stock-movement.schema';
import { Consultation, ConsultationSchema } from '../database/schemas/consultation.schema';
import { Patient, PatientSchema } from '../database/schemas/patient.schema';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    RealtimeModule,
    MongooseModule.forFeature([
      { name: Prescription.name, schema: PrescriptionSchema },
      { name: Medication.name, schema: MedicationSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Consultation.name, schema: ConsultationSchema },
      { name: Patient.name, schema: PatientSchema },
    ]),
  ],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
