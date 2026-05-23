import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LisIntegrationService } from './lis-integration.service';
import { Order, OrderSchema } from '../database/schemas/order.schema';
import { Result, ResultSchema } from '../database/schemas/result.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Result.name, schema: ResultSchema },
    ]),
  ],
  providers: [LisIntegrationService],
  exports: [LisIntegrationService],
})
export class LisIntegrationModule {}
