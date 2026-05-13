import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Admission, AdmissionSchema } from '../database/schemas/admission.schema';
import { Visit, VisitSchema } from '../database/schemas/visit.schema';
import { IdSequence, IdSequenceSchema } from '../database/schemas/id-sequence.schema';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsService } from './admissions.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Admission.name, schema: AdmissionSchema },
      { name: Visit.name, schema: VisitSchema },
      { name: IdSequence.name, schema: IdSequenceSchema },
    ]),
    RealtimeModule,
  ],
  controllers: [AdmissionsController],
  providers: [AdmissionsService],
  exports: [AdmissionsService],
})
export class AdmissionsModule {}
