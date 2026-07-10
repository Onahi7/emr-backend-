import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards, Request } from '@nestjs/common';
import { QueueService } from './queue.service';
import { CreateQueueDto } from './dto/create-queue.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { QueueStatusEnum } from '../database/schemas/queue.schema';

@Controller('queue')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  addToQueue(@Body() createQueueDto: CreateQueueDto, @Request() req: any) {
    return this.queueService.addToQueue(createQueueDto, req.user?.branchId);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  getQueue(@Query('status') status: QueueStatusEnum | undefined, @Request() req: any) {
    return this.queueService.getQueue(status, req.user?.branchId);
  }

  /**
   * Reorder queue entries — must be declared BEFORE :id routes so NestJS
   * does not treat the literal string "reorder" as a dynamic :id value.
   */
  @Patch('reorder')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.NURSE)
  reorderQueue(@Body() body: { queueIds: string[] }, @Request() req: any) {
    return this.queueService.reorderQueue(body.queueIds, req.user?.branchId);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.queueService.findById(id, req.user?.branchId);
  }

  @Patch(':id/status')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: QueueStatusEnum; userId?: string },
    @Request() req: any,
  ) {
    return this.queueService.updateStatus(id, body.status, body.userId, req.user?.branchId);
  }

  @Patch(':id/remove')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.NURSE)
  removeFromQueue(
    @Param('id') id: string,
    @Body() body: { reason: string; cancelledBy: string },
    @Request() req: any,
  ) {
    return this.queueService.removeFromQueue(id, body.reason, body.cancelledBy, req.user?.branchId);
  }
}
