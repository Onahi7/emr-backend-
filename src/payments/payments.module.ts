import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Payment, PaymentSchema } from '../database/schemas/payment.schema';
import { Order, OrderSchema } from '../database/schemas/order.schema';
import { Consultation, ConsultationSchema } from '../database/schemas/consultation.schema';
import { Prescription, PrescriptionSchema } from '../database/schemas/prescription.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Consultation.name, schema: ConsultationSchema },
      { name: Prescription.name, schema: PrescriptionSchema },
    ]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
