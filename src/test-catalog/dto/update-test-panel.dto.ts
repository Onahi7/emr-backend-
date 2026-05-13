import { PartialType } from '@nestjs/mapped-types';
import { CreateTestPanelDto } from './create-test-panel.dto';

export class UpdateTestPanelDto extends PartialType(CreateTestPanelDto) {}
