import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ExpendituresService } from './expenditures.service';
import { CreateExpenditureDto } from './dto/create-expenditure.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('expenditures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpendituresController {
  constructor(private readonly expendituresService: ExpendituresService) {}

  @Post()
  @Roles(UserRoleEnum.RECEPTIONIST, UserRoleEnum.ADMIN)
  async create(
    @Body() createDto: CreateExpenditureDto,
    @Request() req: any,
  ) {
    return this.expendituresService.create(createDto, req.user?.userId);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async findAll(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('category') category?: string,
  ) {
    return this.expendituresService.findAll({ startDate, endDate, category });
  }

  @Get('summary')
  @Roles(UserRoleEnum.ADMIN)
  async getSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.expendituresService.getSummary(startDate, endDate);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async findOne(@Param('id') id: string) {
    return this.expendituresService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async update(
    @Param('id') id: string,
    @Body() updateDto: Partial<CreateExpenditureDto>,
  ) {
    return this.expendituresService.update(id, updateDto);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  async delete(@Param('id') id: string) {
    return this.expendituresService.delete(id);
  }

  @Post(':id/flag')
  @Roles(UserRoleEnum.ADMIN)
  async flag(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    return this.expendituresService.flag(id, req.user?.userId, reason);
  }

  @Post(':id/unflag')
  @Roles(UserRoleEnum.ADMIN)
  async unflag(
    @Param('id') id: string,
  ) {
    return this.expendituresService.unflag(id);
  }
}
