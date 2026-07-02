import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { CafIntegrationService } from './caf-integration.service';
import { Branch, BranchSchema } from '../branches/branch.schema';

@Module({
  imports: [
    HttpModule.register({
      timeout: 15000,
      maxRedirects: 3,
    }),
    MongooseModule.forFeature([{ name: Branch.name, schema: BranchSchema }]),
  ],
  providers: [CafIntegrationService],
  exports: [CafIntegrationService],
})
export class CafIntegrationModule {}
