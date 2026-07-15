import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ResultsService } from './results.service';
import { CreateResultDto } from './dto/create-result.dto';
import { UpdateResultDto } from './dto/update-result.dto';
import { AmendResultDto } from './dto/amend-result.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ResultStatusEnum, ResultFlagEnum } from '../database/schemas/result.schema';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('results')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Post()
  @Roles(UserRoleEnum.LAB_TECH, UserRoleEnum.ADMIN)
  create(@Body() createResultDto: CreateResultDto, @Request() req: any) {
    const userId = req.user?.userId;
    const userRoles = req.user?.roles || [];
    const branchId = req.user?.branchId;
    return this.resultsService.create(createResultDto, userId, userRoles, branchId);
  }

  @Post('bulk')
  @Roles(UserRoleEnum.LAB_TECH, UserRoleEnum.ADMIN)
  createBulk(@Body() createResultDtos: CreateResultDto[], @Request() req: any) {
    const userId = req.user?.userId;
    const userRoles = req.user?.roles || [];
    const branchId = req.user?.branchId;
    return this.resultsService.createBulk(createResultDtos, userId, userRoles, branchId);
  }

  @Get()
  findAll(
    @Query('orderId') orderId?: string,
    @Query('testCode') testCode?: string,
    @Query('status') status?: ResultStatusEnum,
    @Query('flag') flag?: ResultFlagEnum,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Request() req?: any,
  ) {
    return this.resultsService.findAll({
      orderId,
      testCode,
      status,
      flag,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      branchId: req?.user?.branchId,
    });
  }

  @Get('pending-verification')
  @Roles(UserRoleEnum.LAB_TECH, UserRoleEnum.ADMIN)
  findPendingVerification(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Request() req?: any,
  ) {
    return this.resultsService.findPendingVerification(
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
      req?.user?.branchId,
    );
  }

  @Get('critical')
  @Roles(UserRoleEnum.LAB_TECH, UserRoleEnum.ADMIN)
  findCritical(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Request() req?: any,
  ) {
    return this.resultsService.findCritical(
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
      req?.user?.branchId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.resultsService.findOne(id, req.user?.branchId);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.LAB_TECH, UserRoleEnum.ADMIN)
  update(@Param('id') id: string, @Body() updateResultDto: UpdateResultDto, @Request() req: any) {
    return this.resultsService.update(id, updateResultDto, req.user?.branchId);
  }

  @Post(':id/verify')
  @Roles(UserRoleEnum.LAB_TECH, UserRoleEnum.ADMIN)
  verify(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.userId;
    const branchId = req.user?.branchId;
    return this.resultsService.verify(id, userId, branchId);
  }

  @Post(':id/amend')
  @Roles(UserRoleEnum.LAB_TECH, UserRoleEnum.ADMIN)
  amend(
    @Param('id') id: string,
    @Body() amendResultDto: AmendResultDto,
    @Request() req: any,
  ) {
    const userId = req.user?.userId;
    const branchId = req.user?.branchId;
    return this.resultsService.amend(id, amendResultDto, userId, branchId);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.resultsService.remove(id, req.user?.branchId);
  }
}
