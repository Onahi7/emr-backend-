import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Admission, AdmissionSchema } from '../database/schemas/admission.schema';
import { Visit, VisitSchema } from '../database/schemas/visit.schema';
import { IdSequence, IdSequenceSchema } from '../database/schemas/id-sequence.schema';
import { SoapNote, SoapNoteSchema } from '../database/schemas/soap-note.schema';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsService } from './admissions.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { ServicePricesModule } from '../service-prices/service-prices.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Admission.name, schema: AdmissionSchema },
      { name: Visit.name, schema: VisitSchema },
      { name: IdSequence.name, schema: IdSequenceSchema },
      { name: SoapNote.name, schema: SoapNoteSchema },
    ]),
    RealtimeModule,
    ServicePricesModule,
  ],
  controllers: [AdmissionsController],
  providers: [AdmissionsService],
  exports: [AdmissionsService],
})
export class AdmissionsModule {}
