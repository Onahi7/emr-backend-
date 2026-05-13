import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SamplesService } from './samples.service';
import { SamplesController } from './samples.controller';
import { Sample, SampleSchema } from '../database/schemas/sample.schema';
import { Order, OrderSchema } from '../database/schemas/order.schema';
import { IdSequence, IdSequenceSchema } from '../database/schemas/id-sequence.schema';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sample.name, schema: SampleSchema },
      { name: Order.name, schema: OrderSchema },
      { name: IdSequence.name, schema: IdSequenceSchema },
    ]),
    RealtimeModule,
  ],
  controllers: [SamplesController],
  providers: [SamplesService],
  exports: [SamplesService],
})
export class SamplesModule {}
