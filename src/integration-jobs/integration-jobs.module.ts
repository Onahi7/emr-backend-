import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IntegrationJob, IntegrationJobSchema } from '../database/schemas/integration-job.schema';
import { IntegrationJobsController } from './integration-jobs.controller';
import { IntegrationJobsService } from './integration-jobs.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: IntegrationJob.name, schema: IntegrationJobSchema }])],
  controllers: [IntegrationJobsController],
  providers: [IntegrationJobsService],
  exports: [IntegrationJobsService],
})
export class IntegrationJobsModule {}
