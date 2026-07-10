import { Controller, Get, Param, Post, Query, Request } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { IntegrationJobStatus } from '../database/schemas/integration-job.schema';
import { IntegrationJobsService } from './integration-jobs.service';

@Controller('admin/integration-jobs')
@Roles(UserRoleEnum.ADMIN)
export class IntegrationJobsController {
  constructor(private readonly jobs: IntegrationJobsService) {}

  @Get()
  list(
    @Request() req: any,
    @Query('status') status?: IntegrationJobStatus,
    @Query('limit') limit?: string,
  ) {
    return this.jobs.list(req.user?.branchId, status, Number(limit || 100));
  }

  @Post(':id/retry')
  retry(@Param('id') id: string, @Request() req: any) {
    return this.jobs.retry(id, req.user?.branchId);
  }
}
