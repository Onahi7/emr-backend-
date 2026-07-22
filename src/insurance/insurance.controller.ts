import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { InsuranceService } from './insurance.service';
import { CreateInsuranceProgramDto, UpdateInsuranceProgramDto } from './dto/create-insurance-program.dto';
import { CreateInsuranceSubEntityDto, UpdateInsuranceSubEntityDto } from './dto/create-insurance-sub-entity.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('insurance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InsuranceController {
  constructor(private readonly service: InsuranceService) {}

  // ── Programs ──

  @Get('programs')
  findAllPrograms() {
    return this.service.findAllPrograms();
  }

  @Get('programs/lookup')
  getLookup() {
    return this.service.getLookup();
  }

  @Get('programs/:id')
  findProgram(@Param('id') id: string) {
    return this.service.findProgramById(id);
  }

  @Post('programs')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  createProgram(@Body() dto: CreateInsuranceProgramDto) {
    return this.service.createProgram(dto);
  }

  @Patch('programs/:id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  updateProgram(@Param('id') id: string, @Body() dto: UpdateInsuranceProgramDto) {
    return this.service.updateProgram(id, dto);
  }

  @Delete('programs/:id')
  @Roles(UserRoleEnum.ADMIN)
  removeProgram(@Param('id') id: string) {
    return this.service.removeProgram(id);
  }

  // ── Sub-Entities ──

  @Get('programs/:id/subs')
  findSubEntities(@Param('id') programId: string) {
    return this.service.findSubEntitiesByProgram(programId);
  }

  @Get('subs/:id')
  findSubEntity(@Param('id') id: string) {
    return this.service.findSubEntityById(id);
  }

  @Post('programs/:id/subs')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  createSubEntity(@Param('id') programId: string, @Body() dto: CreateInsuranceSubEntityDto) {
    return this.service.createSubEntity(programId, dto);
  }

  @Patch('subs/:id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  updateSubEntity(@Param('id') id: string, @Body() dto: UpdateInsuranceSubEntityDto) {
    return this.service.updateSubEntity(id, dto);
  }

  @Delete('subs/:id')
  @Roles(UserRoleEnum.ADMIN)
  removeSubEntity(@Param('id') id: string) {
    return this.service.removeSubEntity(id);
  }
}
