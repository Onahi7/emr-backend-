import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get(':key')
  async getSetting(@Param('key') key: string) {
    return this.settingsService.getSetting(key);
  }

  @Get()
  async getAllSettings() {
    return this.settingsService.getAllSettings();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  async updateSetting(@Body() dto: UpdateSettingsDto, @Request() req: any) {
    return this.settingsService.updateSetting(
      dto.key,
      dto.value,
      req.user.userId,
      dto.description,
    );
  }

  @Get('connection/config')
  async getConnectionConfig() {
    return this.settingsService.getSetting('connection_config');
  }

  @Post('connection/config')
  @UseGuards(RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  async updateConnectionConfig(@Body() config: any, @Request() req: any) {
    return this.settingsService.updateSetting(
      'connection_config',
      config,
      req.user.userId,
      'Backend connection configuration',
    );
  }
}
