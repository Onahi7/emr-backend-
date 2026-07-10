import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InsuranceProgram, InsuranceProgramSchema, InsuranceSubEntity, InsuranceSubEntitySchema } from '../database/schemas/insurance.schema';
import { InsuranceClaim, InsuranceClaimSchema } from '../database/schemas/insurance-claim.schema';
import { InsuranceBlock, InsuranceBlockSchema } from '../database/schemas/insurance-block.schema';
import { Visit, VisitSchema } from '../database/schemas/visit.schema';
import { Order, OrderSchema } from '../database/schemas/order.schema';
import { Payment, PaymentSchema } from '../database/schemas/payment.schema';
import { InsuranceService } from './insurance.service';
import { InsuranceController } from './insurance.controller';
import { InsuranceClaimsService } from './insurance-claims.service';
import { InsuranceClaimsController } from './insurance-claims.controller';
import { InsuranceBlocksService } from './insurance-blocks.service';
import { InsuranceBlocksController } from './insurance-blocks.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InsuranceProgram.name, schema: InsuranceProgramSchema },
      { name: InsuranceSubEntity.name, schema: InsuranceSubEntitySchema },
      { name: InsuranceClaim.name, schema: InsuranceClaimSchema },
      { name: InsuranceBlock.name, schema: InsuranceBlockSchema },
      { name: Visit.name, schema: VisitSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Payment.name, schema: PaymentSchema },
    ]),
  ],
  controllers: [InsuranceController, InsuranceClaimsController, InsuranceBlocksController],
  providers: [InsuranceService, InsuranceClaimsService, InsuranceBlocksService],
  exports: [InsuranceService, InsuranceClaimsService, InsuranceBlocksService],
})
export class InsuranceModule {}
