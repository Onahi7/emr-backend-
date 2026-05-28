import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CafIntegrationService } from './caf-integration.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 15000,
      maxRedirects: 3,
    }),
  ],
  providers: [CafIntegrationService],
  exports: [CafIntegrationService],
})
export class CafIntegrationModule {}
