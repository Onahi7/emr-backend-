import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { Queue, QueueSchema } from '../database/schemas/queue.schema';
import { Patient, PatientSchema } from '../database/schemas/patient.schema';
import { Consultation, ConsultationSchema } from '../database/schemas/consultation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Queue.name, schema: QueueSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: Consultation.name, schema: ConsultationSchema },
    ]),
  ],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
