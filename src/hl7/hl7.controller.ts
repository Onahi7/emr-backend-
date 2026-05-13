import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Machine } from '../database/schemas/machine.schema';
import { Hl7Service } from './hl7.service';
import { TcpListenerService } from './tcp-listener.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('hl7')
export class Hl7Controller {
  constructor(
    private readonly hl7Service: Hl7Service,
    private readonly tcpListenerService: TcpListenerService,
    @InjectModel(Machine.name) private machineModel: Model<Machine>,
  ) {}

  @Post('receive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async receiveMessage(
    @Body() body: { message: string; machineId: string; protocol?: string },
  ) {
    const { message, machineId, protocol = 'HL7' } = body;

    if (!message || !machineId) {
      throw new BadRequestException('Message and machineId are required');
    }

    let result;
    if (protocol === 'HL7') {
      result = await this.hl7Service.processHL7Message(message, machineId);
    } else if (protocol === 'ASTM') {
      result = await this.hl7Service.processASTMMessage(message, machineId);
    } else if (protocol === 'LIS2-A2') {
      result = await this.hl7Service.processLIS2A2Message(message, machineId);
    } else {
      throw new BadRequestException('Unsupported protocol');
    }

    return {
      success: true,
      ack: result.ack,
      resultsStored: result.results.length,
    };
  }

  /**
   * Unguarded endpoint for direct analyzer / TCP Bridge communication.
   * Authenticates via x-machine-id header validated against the machines collection.
   */
  @Post('machine-receive')
  async machineReceiveMessage(
    @Body() body: { message: string; protocol?: string },
    @Headers('x-machine-id') machineId: string,
  ) {
    if (!machineId) {
      throw new BadRequestException('x-machine-id header is required');
    }

    const machine = await this.machineModel.findById(machineId);
    if (!machine) {
      throw new BadRequestException('Invalid machine ID');
    }

    const { message, protocol } = body;
    if (!message) {
      throw new BadRequestException('Message is required');
    }

    const detectedProtocol = protocol || machine.protocol || 'HL7';

    let result;
    if (detectedProtocol === 'HL7') {
      result = await this.hl7Service.processHL7Message(message, machineId);
    } else if (detectedProtocol === 'ASTM') {
      result = await this.hl7Service.processASTMMessage(message, machineId);
    } else if (detectedProtocol === 'LIS2-A2' || detectedProtocol === 'LIS2_A2') {
      result = await this.hl7Service.processLIS2A2Message(message, machineId);
    } else {
      throw new BadRequestException('Unsupported protocol');
    }

    return {
      success: true,
      ack: result.ack,
      resultsStored: result.results.length,
    };
  }

  @Get('logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async getLogs(
    @Query('machineId') machineId?: string,
    @Query('protocol') protocol?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: any = {
      machineId,
      protocol,
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    };

    if (startDate) {
      filters.startDate = new Date(startDate);
    }
    if (endDate) {
      filters.endDate = new Date(endDate);
    }

    return this.hl7Service.getCommunicationLogs(filters);
  }

  @Get('logs/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async getLogById(@Param('id') id: string) {
    return this.hl7Service.getCommunicationLogById(id);
  }

  @Get('unmatched-results')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async getUnmatchedResults() {
    return this.tcpListenerService.getUnmatchedResults();
  }

  @Post('match-result')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async matchResult(
    @Body() body: { resultIndex: number; orderId: string },
  ) {
    const { resultIndex, orderId } = body;

    if (resultIndex === undefined || !orderId) {
      throw new BadRequestException('resultIndex and orderId are required');
    }

    return this.tcpListenerService.matchResult(resultIndex, orderId);
  }

  @Post('reject-result/:index')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async rejectResult(@Param('index') index: string) {
    const resultIndex = parseInt(index);
    const success = this.tcpListenerService.rejectResult(resultIndex);
    
    if (!success) {
      throw new BadRequestException('Result not found or already processed');
    }

    return { success: true, message: 'Result rejected' };
  }

  @Post('send-order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async sendOrderToMachine(
    @Body() body: { orderId: string; machineId: string },
  ) {
    const { orderId, machineId } = body;

    if (!orderId || !machineId) {
      throw new BadRequestException('orderId and machineId are required');
    }

    return this.hl7Service.sendOrderToMachine(orderId, machineId);
  }

  @Post('restart-listener/:machineId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async restartListener(@Param('machineId') machineId: string) {
    await this.tcpListenerService.restartListener(machineId);
    return { success: true, message: 'TCP listener restarted' };
  }

  @Get('listener-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async getListenerStatus() {
    return this.tcpListenerService.getListenerStatus();
  }
}
