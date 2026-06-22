import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { Visit, VisitSchema } from '../database/schemas/visit.schema';
import { Patient, PatientSchema } from '../database/schemas/patient.schema';
import { Order, OrderSchema } from '../database/schemas/order.schema';
import { OrderTest, OrderTestSchema } from '../database/schemas/order-test.schema';
import { Payment, PaymentSchema } from '../database/schemas/payment.schema';
import { Prescription, PrescriptionSchema } from '../database/schemas/prescription.schema';
import { Medication, MedicationSchema } from '../database/schemas/medication.schema';
import { Profile, ProfileSchema } from '../database/schemas/profile.schema';
import { UserRole, UserRoleSchema } from '../database/schemas/user-role.schema';
import { AuditLog, AuditLogSchema } from '../database/schemas/audit-log.schema';
import { Appointment, AppointmentSchema } from '../database/schemas/appointment.schema';
import { Result, ResultSchema } from '../database/schemas/result.schema';
import { Admission, AdmissionSchema } from '../database/schemas/admission.schema';
import { SoapNote, SoapNoteSchema } from '../database/schemas/soap-note.schema';
import { PatientNote, PatientNoteSchema } from '../database/schemas/patient-note.schema';
import { WalletTransaction, WalletTransactionSchema } from '../database/schemas/wallet-transaction.schema';
import { Sample, SampleSchema } from '../database/schemas/sample.schema';
import { Queue, QueueSchema } from '../database/schemas/queue.schema';
import { CashReconciliation, CashReconciliationSchema } from '../database/schemas/cash-reconciliation.schema';
import { Expenditure, ExpenditureSchema } from '../database/schemas/expenditure.schema';
import { StockMovement, StockMovementSchema } from '../database/schemas/stock-movement.schema';
import { Consultation, ConsultationSchema } from '../database/schemas/consultation.schema';
import { CommunicationLog, CommunicationLogSchema } from '../database/schemas/communication-log.schema';
import { CriticalResultNotification, CriticalResultNotificationSchema } from '../database/schemas/critical-result-notification.schema';
import { QcSample, QcSampleSchema } from '../database/schemas/qc-sample.schema';
import { QcResult, QcResultSchema } from '../database/schemas/qc-result.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Visit.name, schema: VisitSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: Order.name, schema: OrderSchema },
      { name: OrderTest.name, schema: OrderTestSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Prescription.name, schema: PrescriptionSchema },
      { name: Medication.name, schema: MedicationSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: UserRole.name, schema: UserRoleSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Result.name, schema: ResultSchema },
      { name: Admission.name, schema: AdmissionSchema },
      { name: SoapNote.name, schema: SoapNoteSchema },
      { name: PatientNote.name, schema: PatientNoteSchema },
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: Sample.name, schema: SampleSchema },
      { name: Queue.name, schema: QueueSchema },
      { name: CashReconciliation.name, schema: CashReconciliationSchema },
      { name: Expenditure.name, schema: ExpenditureSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Consultation.name, schema: ConsultationSchema },
      { name: CommunicationLog.name, schema: CommunicationLogSchema },
      { name: CriticalResultNotification.name, schema: CriticalResultNotificationSchema },
      { name: QcSample.name, schema: QcSampleSchema },
      { name: QcResult.name, schema: QcResultSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
