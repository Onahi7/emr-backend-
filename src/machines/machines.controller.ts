import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Res,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Response } from 'express';
import { MachinesService } from './machines.service';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';
import { CreateMachineMaintenanceDto } from './dto/create-machine-maintenance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('machines')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async create(@Body() createMachineDto: CreateMachineDto) {
    return this.machinesService.create(createMachineDto);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async findAll(
    @Query('status') status?: string,
    @Query('protocol') protocol?: string,
  ) {
    return this.machinesService.findAll(status, protocol);
  }

  @Get('online')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async getOnlineMachines() {
    return this.machinesService.getOnlineMachines();
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async findOne(@Param('id') id: string) {
    return this.machinesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async update(
    @Param('id') id: string,
    @Body() updateMachineDto: UpdateMachineDto,
  ) {
    return this.machinesService.update(id, updateMachineDto);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  async remove(@Param('id') id: string) {
    await this.machinesService.remove(id);
    return { message: 'Machine deleted successfully' };
  }

  @Post(':id/test-connection')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async testConnection(@Param('id') id: string) {
    return this.machinesService.testConnection(id);
  }

  @Get(':id/bridge-script')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async downloadBridgeScript(
    @Param('id') id: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const script = this.machinesService.generateBridgeScript(id);
    const machine = await this.machinesService.findOne(id);
    const filename = `harbour-bridge-${(machine.name || 'machine').replace(/\s+/g, '-').toLowerCase()}.bat`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(script);
  }

  @Get(':id/maintenance')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async getMaintenanceHistory(@Param('id') id: string) {
    return this.machinesService.getMaintenanceHistory(id);
  }

  @Post(':id/maintenance')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async recordMaintenance(
    @Param('id') id: string,
    @Body() createMaintenanceDto: CreateMachineMaintenanceDto,
    @Request() req: any,
  ) {
    // Ensure machineId in DTO matches the URL parameter
    createMaintenanceDto.machineId = id;
    return this.machinesService.recordMaintenance(
      createMaintenanceDto,
      req.user?.userId,
    );
  }
}
