import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LisIntegrationService } from './lis-integration.service';
import { Order, OrderSchema } from '../database/schemas/order.schema';
import { Result, ResultSchema } from '../database/schemas/result.schema';
import { TestCatalog, TestCatalogSchema } from '../database/schemas/test-catalog.schema';
import { Branch, BranchSchema } from '../branches/branch.schema';
import { Visit, VisitSchema } from '../database/schemas/visit.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Result.name, schema: ResultSchema },
      { name: TestCatalog.name, schema: TestCatalogSchema },
      { name: Branch.name, schema: BranchSchema },
      { name: Visit.name, schema: VisitSchema },
    ]),
  ],
  providers: [LisIntegrationService],
  exports: [LisIntegrationService],
})
export class LisIntegrationModule {}
