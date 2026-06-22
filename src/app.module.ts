import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule as ConfigurationModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PatientsModule } from './patients/patients.module';
import { VisitsModule } from './visits/visits.module';
import { OrdersModule } from './orders/orders.module';
import { SamplesModule } from './samples/samples.module';
import { ResultsModule } from './results/results.module';
import { TestCatalogModule } from './test-catalog/test-catalog.module';
import { MachinesModule } from './machines/machines.module';
import { Hl7Module } from './hl7/hl7.module';
import { QcModule } from './qc/qc.module';
import { AuditModule } from './audit/audit.module';
import { ReportsModule } from './reports/reports.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { ReportTemplatesModule } from './report-templates/report-templates.module';
import { SettingsModule } from './settings/settings.module';
import { ExpendituresModule } from './expenditures/expenditures.module';
import { DoctorsModule } from './doctors/doctors.module';
import { PanelInterpretationsModule } from './panel-interpretations/panel-interpretations.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { QueueModule } from './queue/queue.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { PaymentsModule } from './payments/payments.module';
import { MedicationsModule } from './medications/medications.module';
import { SoapNotesModule } from './soap-notes/soap-notes.module';
import { AdminModule } from './admin/admin.module';
import { BackupModule } from './backup/backup.module';
import { AdmissionsModule } from './admissions/admissions.module';
import { InventoryModule } from './inventory/inventory.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { RoomsModule } from './rooms/rooms.module';
import { LisIntegrationModule } from './lis-integration/lis-integration.module';
import { CafIntegrationModule } from './caf-integration/caf-integration.module';
import { BranchesModule } from './branches/branches.module';
import { TreatmentPlansModule } from './treatment-plans/treatment-plans.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AuditLoggingInterceptor } from './common/interceptors/audit-logging.interceptor';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
    ScheduleModule.forRoot(),
    ConfigurationModule,
    DatabaseModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    VisitsModule,
    OrdersModule,
    SamplesModule,
    ResultsModule,
    TestCatalogModule,
    MachinesModule,
    Hl7Module,
    QcModule,
    AuditModule,
    ReportsModule,
    RealtimeModule,
    ReconciliationModule,
    ReportTemplatesModule,
    SettingsModule,
    ExpendituresModule,
    DoctorsModule,
    PanelInterpretationsModule,
    ConsultationsModule,
    QueueModule,
    PrescriptionsModule,
    PaymentsModule,
    MedicationsModule,
    SoapNotesModule,
    AdminModule,
    BackupModule,
    AdmissionsModule,
    InventoryModule,
    AppointmentsModule,
    RoomsModule,
    LisIntegrationModule,
    CafIntegrationModule,
    BranchesModule,
    TreatmentPlansModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLoggingInterceptor,
    },
  ],
})
export class AppModule {}
