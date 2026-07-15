import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SoapNotesService } from './soap-notes.service';
import { SoapNotesController } from './soap-notes.controller';
import { SoapNote, SoapNoteSchema } from '../database/schemas/soap-note.schema';
import { Visit, VisitSchema } from '../database/schemas/visit.schema';
import { Patient, PatientSchema } from '../database/schemas/patient.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SoapNote.name, schema: SoapNoteSchema },
      { name: Visit.name, schema: VisitSchema },
      { name: Patient.name, schema: PatientSchema },
    ]),
  ],
  controllers: [SoapNotesController],
  providers: [SoapNotesService],
  exports: [SoapNotesService],
})
export class SoapNotesModule {}
