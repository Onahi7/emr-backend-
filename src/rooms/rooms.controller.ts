import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, Request,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('rooms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN)
  async create(@Body() createRoomDto: CreateRoomDto, @Request() req: any) {
    return this.roomsService.create(createRoomDto, req.user?.branchId);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  async findAll(
    @Query('roomType') roomType: string | undefined,
    @Query('status') status: string | undefined,
    @Request() req: any,
  ) {
    return this.roomsService.findAll(roomType, status, req.user?.branchId);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.roomsService.findOne(id, req.user?.branchId);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN)
  async update(@Param('id') id: string, @Body() updateRoomDto: UpdateRoomDto, @Request() req: any) {
    return this.roomsService.update(id, updateRoomDto, req.user?.branchId);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.roomsService.remove(id, req.user?.branchId);
  }

  @Post(':id/assign/:visitId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  async assignRoom(@Param('visitId') visitId: string, @Param('id') roomId: string, @Request() req: any) {
    return this.roomsService.assignRoom(visitId, roomId, req.user?.branchId);
  }

  @Post(':id/release')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE)
  async releaseRoom(@Param('id') id: string, @Request() req: any) {
    return this.roomsService.releaseRoom(id, req.user?.branchId);
  }

  @Post('auto-assign/:visitId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.DOCTOR, UserRoleEnum.NURSE, UserRoleEnum.RECEPTIONIST)
  async autoAssignRoom(
    @Param('visitId') visitId: string,
    @Query('preferredType') preferredType: string | undefined,
    @Request() req: any,
  ) {
    return this.roomsService.autoAssignRoom(visitId, preferredType, req.user?.branchId);
  }

  @Post('seed')
  @Roles(UserRoleEnum.ADMIN)
  async seed(@Request() req: any) {
    const count = await this.roomsService.seedDefaultRooms(req.user?.branchId);
    return { message: `${count} rooms ready` };
  }
}
