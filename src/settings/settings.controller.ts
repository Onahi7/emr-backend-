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
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Get all settings — admin only (may contain sensitive config)
   * GET /settings
   */
  @Get()
  @Roles(UserRoleEnum.ADMIN)
  async getAllSettings() {
    return this.settingsService.getAllSettings();
  }

  /**
   * Upsert a setting — admin only
   * POST /settings
   */
  @Post()
  @Roles(UserRoleEnum.ADMIN)
  async updateSetting(@Body() dto: UpdateSettingsDto, @Request() req: any) {
    return this.settingsService.updateSetting(
      dto.key,
      dto.value,
      req.user.userId,
      dto.description,
    );
  }

  /**
   * Get/update connection config — literal sub-path MUST come before :key
   * GET /settings/connection/config
   */
  @Get('connection/config')
  @Roles(
    UserRoleEnum.ADMIN,
    UserRoleEnum.DOCTOR,
    UserRoleEnum.SPECIALIST,
    UserRoleEnum.NURSE,
    UserRoleEnum.RECEPTIONIST,
    UserRoleEnum.LAB_TECH,
    UserRoleEnum.PHARMACIST,
    UserRoleEnum.INVENTORY_MANAGER,
  )
  async getConnectionConfig() {
    return this.settingsService.getSetting('connection_config');
  }

  @Post('connection/config')
  @Roles(UserRoleEnum.ADMIN)
  async updateConnectionConfig(@Body() config: any, @Request() req: any) {
    return this.settingsService.updateSetting(
      'connection_config',
      config,
      req.user.userId,
      'Backend connection configuration',
    );
  }

  /**
   * Get a single setting by key — admin only
   * GET /settings/:key  (must be LAST — catches everything not matched above)
   */
  @Get(':key')
  @Roles(UserRoleEnum.ADMIN)
  async getSetting(@Param('key') key: string) {
    return this.settingsService.getSetting(key);
  }
}
