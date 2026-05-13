import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { QcService } from './qc.service';
import { CreateQcSampleDto } from './dto/create-qc-sample.dto';
import { CreateQcResultDto } from './dto/create-qc-result.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('qc')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QcController {
  constructor(private readonly qcService: QcService) {}

  @Post('samples')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async createQcSample(
    @Body() createQcSampleDto: CreateQcSampleDto,
    @Request() req: any,
  ) {
    return this.qcService.createQcSample(createQcSampleDto, req.user.userId);
  }

  @Get('samples')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async getQcSamples(
    @Query('testCode') testCode?: string,
    @Query('level') level?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.qcService.findAllQcSamples({
      testCode,
      level,
      isActive: isActive === 'true',
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('samples/:id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async getQcSampleById(@Param('id') id: string) {
    return this.qcService.findQcSampleById(id);
  }

  @Post('results')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async createQcResult(
    @Body() createQcResultDto: CreateQcResultDto,
    @Request() req: any,
  ) {
    return this.qcService.createQcResult(createQcResultDto, req.user.userId);
  }

  @Get('results')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async getQcResults(
    @Query('qcSampleId') qcSampleId?: string,
    @Query('testCode') testCode?: string,
    @Query('isInRange') isInRange?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: any = {
      qcSampleId,
      testCode,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    };

    if (isInRange !== undefined) {
      filters.isInRange = isInRange === 'true';
    }
    if (startDate) {
      filters.startDate = new Date(startDate);
    }
    if (endDate) {
      filters.endDate = new Date(endDate);
    }

    return this.qcService.findAllQcResults(filters);
  }

  @Get('results/out-of-range')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async getOutOfRangeResults(
    @Query('testCode') testCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: any = {
      testCode,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    };

    if (startDate) {
      filters.startDate = new Date(startDate);
    }
    if (endDate) {
      filters.endDate = new Date(endDate);
    }

    return this.qcService.findOutOfRangeResults(filters);
  }

  @Get('results/:id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async getQcResultById(@Param('id') id: string) {
    return this.qcService.findQcResultById(id);
  }
}
