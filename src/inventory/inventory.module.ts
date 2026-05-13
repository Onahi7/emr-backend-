import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Medication, MedicationSchema } from '../database/schemas/medication.schema';
import { StockMovement, StockMovementSchema } from '../database/schemas/stock-movement.schema';
import { Supplier, SupplierSchema } from '../database/schemas/supplier.schema';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Medication.name, schema: MedicationSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Supplier.name, schema: SupplierSchema },
    ]),
    RealtimeModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
