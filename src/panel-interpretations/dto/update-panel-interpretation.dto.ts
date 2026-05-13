import { PartialType } from '@nestjs/mapped-types';
import { CreatePanelInterpretationDto } from './create-panel-interpretation.dto';

export class UpdatePanelInterpretationDto extends PartialType(CreatePanelInterpretationDto) {}
