import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SamplesService } from './samples.service';
import { CreateSampleDto } from './dto/create-sample.dto';
import { UpdateSampleDto } from './dto/update-sample.dto';
import { RejectSampleDto } from './dto/reject-sample.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('samples')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SamplesController {
  constructor(private readonly samplesService: SamplesService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async create(@Body() createSampleDto: CreateSampleDto, @Request() req: any) {
    return this.samplesService.create(createSampleDto, req.user?.userId);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('orderId') orderId?: string,
    @Query('patientId') patientId?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.samplesService.findAll(pageNum, limitNum, status, orderId, patientId);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async findOne(@Param('id') id: string) {
    return this.samplesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async update(
    @Param('id') id: string,
    @Body() updateSampleDto: UpdateSampleDto,
  ) {
    return this.samplesService.update(id, updateSampleDto);
  }

  @Post(':id/reject')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async reject(
    @Param('id') id: string,
    @Body() rejectSampleDto: RejectSampleDto,
    @Request() req: any,
  ) {
    return this.samplesService.reject(id, rejectSampleDto, req.user?.userId);
  }
}
