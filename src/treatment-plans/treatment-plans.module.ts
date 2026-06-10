import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TreatmentPlansService } from './treatment-plans.service';
import { TreatmentPlansController } from './treatment-plans.controller';
import { TreatmentPlan, TreatmentPlanSchema } from '../database/schemas/treatment-plan.schema';
import { Patient, PatientSchema } from '../database/schemas/patient.schema';
import { Profile, ProfileSchema } from '../database/schemas/profile.schema';
import { Visit, VisitSchema } from '../database/schemas/visit.schema';
import { Payment, PaymentSchema } from '../database/schemas/payment.schema';
import { WalletTransaction, WalletTransactionSchema } from '../database/schemas/wallet-transaction.schema';
import { Prescription, PrescriptionSchema } from '../database/schemas/prescription.schema';
import { Order, OrderSchema } from '../database/schemas/order.schema';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { OrdersModule } from '../orders/orders.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TreatmentPlan.name, schema: TreatmentPlanSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: Visit.name, schema: VisitSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: Prescription.name, schema: PrescriptionSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
    PrescriptionsModule,
    OrdersModule,
    RealtimeModule,
  ],
  controllers: [TreatmentPlansController],
  providers: [TreatmentPlansService],
  exports: [TreatmentPlansService],
})
export class TreatmentPlansModule {}
