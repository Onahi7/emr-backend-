import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VisitsService } from './visits.service';
import { VisitsController } from './visits.controller';
import { Visit, VisitSchema } from '../database/schemas/visit.schema';
import { Patient, PatientSchema } from '../database/schemas/patient.schema';
import { Doctor, DoctorSchema } from '../database/schemas/doctor.schema';
import { IdSequence, IdSequenceSchema } from '../database/schemas/id-sequence.schema';
import { Payment, PaymentSchema } from '../database/schemas/payment.schema';
import { Queue, QueueSchema } from '../database/schemas/queue.schema';
import { InsuranceBlock, InsuranceBlockSchema } from '../database/schemas/insurance-block.schema';
import { RealtimeModule } from '../realtime/realtime.module';
import { OrdersModule } from '../orders/orders.module';
import { ServicePricesModule } from '../service-prices/service-prices.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Visit.name, schema: VisitSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: IdSequence.name, schema: IdSequenceSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Queue.name, schema: QueueSchema },
      { name: InsuranceBlock.name, schema: InsuranceBlockSchema },
    ]),
    RealtimeModule,
    OrdersModule,
    ServicePricesModule,
  ],
  controllers: [VisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
