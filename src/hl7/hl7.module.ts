import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Hl7Controller } from './hl7.controller';
import { Hl7Service } from './hl7.service';
import { TcpListenerService } from './tcp-listener.service';
import {
  CommunicationLog,
  CommunicationLogSchema,
} from '../database/schemas/communication-log.schema';
import { Result, ResultSchema } from '../database/schemas/result.schema';
import { Order, OrderSchema } from '../database/schemas/order.schema';
import { OrderTest, OrderTestSchema } from '../database/schemas/order-test.schema';
import { Machine, MachineSchema } from '../database/schemas/machine.schema';
import { Patient, PatientSchema } from '../database/schemas/patient.schema';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CommunicationLog.name, schema: CommunicationLogSchema },
      { name: Result.name, schema: ResultSchema },
      { name: Order.name, schema: OrderSchema },
      { name: OrderTest.name, schema: OrderTestSchema },
      { name: Machine.name, schema: MachineSchema },
      { name: Patient.name, schema: PatientSchema },
    ]),
    forwardRef(() => RealtimeModule),
  ],
  controllers: [Hl7Controller],
  providers: [Hl7Service, TcpListenerService],
  exports: [Hl7Service, TcpListenerService],
})
export class Hl7Module {}
