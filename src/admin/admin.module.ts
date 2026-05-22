import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { Visit, VisitSchema } from '../database/schemas/visit.schema';
import { Patient, PatientSchema } from '../database/schemas/patient.schema';
import { Order, OrderSchema } from '../database/schemas/order.schema';
import { Payment, PaymentSchema } from '../database/schemas/payment.schema';
import { Prescription, PrescriptionSchema } from '../database/schemas/prescription.schema';
import { Medication, MedicationSchema } from '../database/schemas/medication.schema';
import { Profile, ProfileSchema } from '../database/schemas/profile.schema';
import { UserRole, UserRoleSchema } from '../database/schemas/user-role.schema';
import { AuditLog, AuditLogSchema } from '../database/schemas/audit-log.schema';
import { Appointment, AppointmentSchema } from '../database/schemas/appointment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Visit.name, schema: VisitSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Prescription.name, schema: PrescriptionSchema },
      { name: Medication.name, schema: MedicationSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: UserRole.name, schema: UserRoleSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: Appointment.name, schema: AppointmentSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
