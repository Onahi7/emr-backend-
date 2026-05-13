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

  /**
   * Create a new result (manual entry)
   * POST /results
   * Requires: lab_tech, receptionist, or admin role
   */
  @Post()
  @Roles(UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST, UserRoleEnum.ADMIN)
  create(@Body() createResultDto: CreateResultDto, @Request() req: any) {
    const userId = req.user?.userId;
    const userRoles = req.user?.roles || [];
    return this.resultsService.create(createResultDto, userId, userRoles);
  }

  /**
   * Create multiple results in bulk (much faster)
   * POST /results/bulk
   * Requires: lab_tech, receptionist, or admin role
   */
  @Post('bulk')
  @Roles(UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST, UserRoleEnum.ADMIN)
  createBulk(@Body() createResultDtos: CreateResultDto[], @Request() req: any) {
    const userId = req.user?.userId;
    const userRoles = req.user?.roles || [];
    return this.resultsService.createBulk(createResultDtos, userId, userRoles);
  }

  /**
   * Get all results with optional filters
   * GET /results?orderId=xxx&testCode=xxx&status=xxx&flag=xxx&page=1&limit=10
   * Requires: authenticated user
   */
  @Get()
  findAll(
    @Query('orderId') orderId?: string,
    @Query('testCode') testCode?: string,
    @Query('status') status?: ResultStatusEnum,
    @Query('flag') flag?: ResultFlagEnum,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.resultsService.findAll({
      orderId,
      testCode,
      status,
      flag,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * Get results pending verification
   * GET /results/pending-verification?page=1&limit=10
   * Requires: lab_tech or admin role
   */
  @Get('pending-verification')
  @Roles(UserRoleEnum.LAB_TECH, UserRoleEnum.ADMIN)
  findPendingVerification(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.resultsService.findPendingVerification(
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  /**
   * Get critical results
   * GET /results/critical?page=1&limit=10
   * Requires: lab_tech or admin role
   */
  @Get('critical')
  @Roles(UserRoleEnum.LAB_TECH, UserRoleEnum.ADMIN)
  findCritical(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.resultsService.findCritical(
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  /**
   * Get a single result by ID
   * GET /results/:id
   * Requires: authenticated user
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.resultsService.findOne(id);
  }

  /**
   * Update a result
   * PATCH /results/:id
   * Requires: lab_tech, receptionist, or admin role
   */
  @Patch(':id')
  @Roles(UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST, UserRoleEnum.ADMIN)
  update(@Param('id') id: string, @Body() updateResultDto: UpdateResultDto) {
    return this.resultsService.update(id, updateResultDto);
  }

  /**
   * Verify a result
   * POST /results/:id/verify
   * Requires: lab_tech or admin role
   */
  @Post(':id/verify')
  @Roles(UserRoleEnum.LAB_TECH, UserRoleEnum.ADMIN)
  verify(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.userId;
    return this.resultsService.verify(id, userId);
  }

  /**
   * Amend a result with reason tracking
   * POST /results/:id/amend
   * Requires: lab_tech or admin role
   */
  @Post(':id/amend')
  @Roles(UserRoleEnum.LAB_TECH, UserRoleEnum.ADMIN)
  amend(
    @Param('id') id: string,
    @Body() amendResultDto: AmendResultDto,
    @Request() req: any,
  ) {
    const userId = req.user?.userId;
    return this.resultsService.amend(id, amendResultDto, userId);
  }

  /**
   * Delete a result
   * DELETE /results/:id
   * Requires: admin role only
   */
  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  remove(@Param('id') id: string) {
    return this.resultsService.remove(id);
  }
}
