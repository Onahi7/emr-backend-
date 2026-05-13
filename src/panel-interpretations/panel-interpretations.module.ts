import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { PanelInterpretationsController } from './panel-interpretations.controller';
import { PanelInterpretationsService } from './panel-interpretations.service';
import { AiInterpretationService } from '../ai-interpretation/ai-interpretation.service';
import {
  PanelInterpretation,
  PanelInterpretationSchema,
} from '../database/schemas/panel-interpretation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PanelInterpretation.name, schema: PanelInterpretationSchema },
    ]),
    HttpModule,
  ],
  controllers: [PanelInterpretationsController],
  providers: [PanelInterpretationsService, AiInterpretationService],
  exports: [PanelInterpretationsService],
})
export class PanelInterpretationsModule {}
