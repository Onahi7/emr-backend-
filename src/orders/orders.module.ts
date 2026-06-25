import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order, OrderSchema } from '../database/schemas/order.schema';
import { OrderTest, OrderTestSchema } from '../database/schemas/order-test.schema';
import { IdSequence, IdSequenceSchema } from '../database/schemas/id-sequence.schema';
import { Payment, PaymentSchema } from '../database/schemas/payment.schema';
import { TestCatalog, TestCatalogSchema } from '../database/schemas/test-catalog.schema';
import { Doctor, DoctorSchema } from '../database/schemas/doctor.schema';
import { Visit, VisitSchema } from '../database/schemas/visit.schema';
import { TreatmentPlan, TreatmentPlanSchema } from '../database/schemas/treatment-plan.schema';
import { RealtimeModule } from '../realtime/realtime.module';
import { LisIntegrationModule } from '../lis-integration/lis-integration.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: OrderTest.name, schema: OrderTestSchema },
      { name: IdSequence.name, schema: IdSequenceSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: TestCatalog.name, schema: TestCatalogSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: Visit.name, schema: VisitSchema },
      { name: TreatmentPlan.name, schema: TreatmentPlanSchema },
    ]),
    RealtimeModule,
    LisIntegrationModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
