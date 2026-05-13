import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MachinesService } from './machines.service';
import { MachinesController } from './machines.controller';
import { Machine, MachineSchema } from '../database/schemas/machine.schema';
import {
  MachineMaintenance,
  MachineMaintenanceSchema,
} from '../database/schemas/machine-maintenance.schema';
import { Hl7Module } from '../hl7/hl7.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Machine.name, schema: MachineSchema },
      { name: MachineMaintenance.name, schema: MachineMaintenanceSchema },
    ]),
    forwardRef(() => Hl7Module),
    forwardRef(() => RealtimeModule),
  ],
  controllers: [MachinesController],
  providers: [MachinesService],
  exports: [MachinesService],
})
export class MachinesModule {}
