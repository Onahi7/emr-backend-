import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TreatmentPlansService } from './treatment-plans.service';
import { TreatmentPlansController } from './treatment-plans.controller';
import { TreatmentPlan, TreatmentPlanSchema } from '../database/schemas/treatment-plan.schema';
import { Patient, PatientSchema } from '../database/schemas/patient.schema';
import { Visit, VisitSchema } from '../database/schemas/visit.schema';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { OrdersModule } from '../orders/orders.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TreatmentPlan.name, schema: TreatmentPlanSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: Visit.name, schema: VisitSchema },
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
