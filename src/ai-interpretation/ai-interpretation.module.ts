import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AiInterpretationService } from './ai-interpretation.service';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [AiInterpretationService],
  exports: [AiInterpretationService],
})
export class AiInterpretationModule {}