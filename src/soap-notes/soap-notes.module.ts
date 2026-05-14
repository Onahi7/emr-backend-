import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SoapNotesService } from './soap-notes.service';
import { SoapNotesController } from './soap-notes.controller';
import { SoapNote, SoapNoteSchema } from '../database/schemas/soap-note.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SoapNote.name, schema: SoapNoteSchema },
    ]),
  ],
  controllers: [SoapNotesController],
  providers: [SoapNotesService],
  exports: [SoapNotesService],
})
export class SoapNotesModule {}
