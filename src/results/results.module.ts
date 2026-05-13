import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ResultsService } from './results.service';
import { ResultsController } from './results.controller';
import { Result, ResultSchema } from '../database/schemas/result.schema';
import { Order, OrderSchema } from '../database/schemas/order.schema';
import { Patient, PatientSchema } from '../database/schemas/patient.schema';
import { TestCatalog, TestCatalogSchema } from '../database/schemas/test-catalog.schema';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Result.name, schema: ResultSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: TestCatalog.name, schema: TestCatalogSchema },
    ]),
    RealtimeModule,
  ],
  controllers: [ResultsController],
  providers: [ResultsService],
  exports: [ResultsService],
})
export class ResultsModule {}
