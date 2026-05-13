import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiInterpretationService } from './ai-interpretation.service';

@Module({
  imports: [HttpModule],
  providers: [AiInterpretationService],
  exports: [AiInterpretationService],
})
export class AiInterpretationModule {}