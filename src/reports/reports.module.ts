import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Order, OrderSchema } from '../database/schemas/order.schema';
import { Result, ResultSchema } from '../database/schemas/result.schema';
import { Machine, MachineSchema } from '../database/schemas/machine.schema';
import { Sample, SampleSchema } from '../database/schemas/sample.schema';
import { Patient, PatientSchema } from '../database/schemas/patient.schema';
import { TestCatalog, TestCatalogSchema } from '../database/schemas/test-catalog.schema';
import { Profile, ProfileSchema } from '../database/schemas/profile.schema';
import { OrderTest, OrderTestSchema } from '../database/schemas/order-test.schema';
import { PanelInterpretation, PanelInterpretationSchema } from '../database/schemas/panel-interpretation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Result.name, schema: ResultSchema },
      { name: Machine.name, schema: MachineSchema },
      { name: Sample.name, schema: SampleSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: TestCatalog.name, schema: TestCatalogSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: OrderTest.name, schema: OrderTestSchema },
      { name: PanelInterpretation.name, schema: PanelInterpretationSchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
