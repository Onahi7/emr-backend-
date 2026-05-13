import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import {
  CashReconciliation,
  CashReconciliationSchema,
} from '../database/schemas/cash-reconciliation.schema';
import { Order, OrderSchema } from '../database/schemas/order.schema';
import { Expenditure, ExpenditureSchema } from '../database/schemas/expenditure.schema';
import { Payment, PaymentSchema } from '../database/schemas/payment.schema';
import { OrderTest, OrderTestSchema } from '../database/schemas/order-test.schema';
import { Patient, PatientSchema } from '../database/schemas/patient.schema';
import { Doctor, DoctorSchema } from '../database/schemas/doctor.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CashReconciliation.name, schema: CashReconciliationSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Expenditure.name, schema: ExpenditureSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: OrderTest.name, schema: OrderTestSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: Doctor.name, schema: DoctorSchema },
    ]),
  ],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
