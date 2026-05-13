import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SoapNotesService } from './soap-notes.service';
import { SoapNotesController } from './soap-notes.controller';
import { SoapNote, SoapNoteSchema } from '../database/schemas/soap-note.schema';
import { Patient, PatientSchema } from '../database/schemas/patient.schema';
import { Consultation, ConsultationSchema } from '../database/schemas/consultation.schema';
import { Doctor, DoctorSchema } from '../database/schemas/doctor.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SoapNote.name, schema: SoapNoteSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: Consultation.name, schema: ConsultationSchema },
      { name: Doctor.name, schema: DoctorSchema },
    ]),
  ],
  controllers: [SoapNotesController],
  providers: [SoapNotesService],
  exports: [SoapNotesService],
})
export class SoapNotesModule {}
