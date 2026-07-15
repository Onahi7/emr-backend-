import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin
      if (!origin) return callback(null, true);
      
      // Allow configured origin
      const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
      if (origin === corsOrigin) return callback(null, true);
      
      // Allow any localhost/127.0.0.1 with any port (for development)
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      
      // Allow any LAN origin
      if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      
      // Allow Cloudflare Workers/Pages
      if (/^https:\/\/[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.workers\.dev$/.test(origin) || 
          /^https:\/\/[a-zA-Z0-9-]+\.pages\.dev$/.test(origin)) {
        return callback(null, true);
      }
      
      callback(null, false);
    },
    credentials: true,
  },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private connectedClients = new Map<string, { userId: string; roles: string[]; branchId?: string }>();

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token;
      
      if (!token) {
        this.logger.error(`No token provided for client ${client.id}`);
        client.disconnect();
        return;
      }

      this.logger.debug(`Attempting to verify token for client ${client.id}`);
      const payload = await this.jwtService.verifyAsync(token);
      
      const roles = Array.isArray(payload.roles)
        ? payload.roles
        : payload.role
          ? [payload.role]
          : [];
      const branchId = payload.branchId || undefined;

      this.connectedClients.set(client.id, {
        userId: payload.sub,
        roles,
        branchId,
      });

      this.logger.log(`Client connected: ${client.id} (User: ${payload.sub}, Roles: ${roles.join(', ') || 'none'}, Branch: ${branchId || 'none'})`);
      
      roles.forEach((role) => {
        client.join(`role:${role}`);
        if (branchId) client.join(`branch:${branchId}:role:${role}`);
      });
      if (branchId) {
        client.join(`branch:${branchId}`);
      }
      
      client.emit('connected', {
        message: 'Connected to real-time updates',
        clientId: client.id,
      });

      this.server.emit('clients:count', { count: this.connectedClients.size });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Authentication failed for client ${client.id}: ${errorMessage}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
    this.server.emit('clients:count', { count: this.connectedClients.size });
  }

  emitToAll(event: string, data: any) {
    this.server.emit(event, data);
  }

  emitToBranch(branchId: string | undefined, event: string, data: any) {
    if (!branchId) {
      this.logger.warn(`Dropped ${event}: missing branch context`);
      return;
    }
    this.server.to(`branch:${branchId}`).emit(event, data);
  }

  emitToRole(role: string, event: string, data: any) {
    this.server.to(`role:${role}`).emit(event, data);
  }

  emitToBranchRole(branchId: string | undefined, role: string, event: string, data: any) {
    if (!branchId) {
      this.logger.warn(`Dropped ${event}: missing branch context`);
      return;
    }
    this.server.to(`branch:${branchId}:role:${role}`).emit(event, data);
  }

  private extractBranchId(entity: any): string | undefined {
    return entity?.branchId?.toString?.() || entity?.branchId || undefined;
  }

  notifyOrderCreated(order: any) {
    this.logger.log(`Broadcasting order created: ${order.orderNumber}`);
    this.emitToBranch(this.extractBranchId(order), 'order:created', order);
  }

  notifyOrderUpdated(order: any) {
    this.logger.log(`Broadcasting order updated: ${order.orderNumber}`);
    this.emitToBranch(this.extractBranchId(order), 'order:updated', order);
  }

  notifyOrderStatusChanged(orderId: string, status: string, orderNumber: string, branchId?: string) {
    this.logger.log(`Broadcasting order status changed: ${orderNumber} -> ${status}`);
    this.emitToBranch(branchId, 'order:status_changed', { orderId, status, orderNumber });
  }

  notifyResultCreated(result: any) {
    this.logger.log(`Broadcasting result created: ${result.testCode}`);
    this.emitToBranch(this.extractBranchId(result), 'result:created', result);
    
    if (result.flag === 'critical_high' || result.flag === 'critical_low') {
      const branchId = this.extractBranchId(result);
      this.emitToBranchRole(branchId, 'lab_tech', 'result:critical', result);
      this.emitToBranchRole(branchId, 'admin', 'result:critical', result);
    }
  }

  notifyResultVerified(result: any) {
    this.logger.log(`Broadcasting result verified: ${result.testCode}`);
    this.emitToBranch(this.extractBranchId(result), 'result:verified', result);
  }

  notifyPatientCreated(patient: any) {
    this.logger.log(`Broadcasting patient created: ${patient.patientId}`);
    this.emitToBranch(this.extractBranchId(patient), 'patient:created', patient);
  }

  notifySampleCollected(sample: any) {
    this.logger.log(`Broadcasting sample collected`);
    const branchId = this.extractBranchId(sample);
    this.emitToBranchRole(branchId, 'lab_tech', 'sample:collected', sample);
    this.emitToBranchRole(branchId, 'admin', 'sample:collected', sample);
  }

  notifyMachineStatusChanged(machine: any) {
    this.logger.log(`Broadcasting machine status changed: ${machine.name} -> ${machine.status}`);
    this.emitToBranch(this.extractBranchId(machine), 'machine:updated', machine);
  }

  notifyMachineResultReceived(data: { machineId: string; machineName: string; resultCount: number; protocol: string; autoMatched?: boolean; orderId?: string; orderNumber?: string; branchId?: string }) {
    this.logger.log(`Broadcasting machine result received from ${data.machineName}: ${data.resultCount} results`);
    this.emitToBranch(data.branchId, 'machine:result_received', data);
  }

  notifyCommunicationLog(log: any) {
    this.logger.log(`Broadcasting new communication log`);
    this.emitToBranch(this.extractBranchId(log), 'communication-log:new', log);
  }

  notifyUnmatchedResult(result: any) {
    this.logger.log(`Broadcasting unmatched result from ${result.machineName}`);
    const branchId = this.extractBranchId(result);
    this.emitToBranchRole(branchId, 'lab_tech', 'result:unmatched', result);
    this.emitToBranchRole(branchId, 'admin', 'result:unmatched', result);
  }

  notifyOrderSentToMachine(data: { orderId: string; orderNumber: string; machineName: string; success: boolean; branchId?: string }) {
    this.logger.log(`Broadcasting order sent to machine: ${data.orderNumber} -> ${data.machineName}`);
    this.emitToBranch(data.branchId, 'order:sent_to_machine', data);
  }

  // Get connected clients count
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  // Get clients by role
  getClientsByRole(role: string): number {
    return Array.from(this.connectedClients.values())
      .filter(client => client.roles.includes(role))
      .length;
  }
}
