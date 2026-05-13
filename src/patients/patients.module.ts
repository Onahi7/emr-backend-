import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { Patient, PatientSchema } from '../database/schemas/patient.schema';
import {
  PatientNote,
  PatientNoteSchema,
} from '../database/schemas/patient-note.schema';
import {
  IdSequence,
  IdSequenceSchema,
} from '../database/schemas/id-sequence.schema';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Patient.name, schema: PatientSchema },
      { name: PatientNote.name, schema: PatientNoteSchema },
      { name: IdSequence.name, schema: IdSequenceSchema },
    ]),
    RealtimeModule,
  ],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
