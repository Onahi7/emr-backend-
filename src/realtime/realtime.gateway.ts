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
  private connectedClients = new Map<string, { userId: string; role: string }>();

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      // Authenticate client
      const token = client.handshake.auth.token;
      
      if (!token) {
        this.logger.error(`No token provided for client ${client.id}`);
        client.disconnect();
        return;
      }

      this.logger.debug(`Attempting to verify token for client ${client.id}`);
      const payload = await this.jwtService.verifyAsync(token);
      
      this.connectedClients.set(client.id, {
        userId: payload.sub,
        role: payload.roles[0],
      });

      this.logger.log(`Client connected: ${client.id} (User: ${payload.sub}, Role: ${payload.roles[0]})`);
      
      // Join role-specific room
      client.join(`role:${payload.roles[0]}`);
      
      // Send connection confirmation
      client.emit('connected', {
        message: 'Connected to real-time updates',
        clientId: client.id,
      });

      // Broadcast updated client count
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
    // Broadcast updated client count
    this.server.emit('clients:count', { count: this.connectedClients.size });
  }

  // Emit to all clients
  emitToAll(event: string, data: any) {
    this.server.emit(event, data);
  }

  // Emit to specific role
  emitToRole(role: string, event: string, data: any) {
    this.server.to(`role:${role}`).emit(event, data);
  }

  // Order events
  notifyOrderCreated(order: any) {
    this.logger.log(`Broadcasting order created: ${order.orderNumber}`);
    this.emitToAll('order:created', order);
  }

  notifyOrderUpdated(order: any) {
    this.logger.log(`Broadcasting order updated: ${order.orderNumber}`);
    this.emitToAll('order:updated', order);
  }

  notifyOrderStatusChanged(orderId: string, status: string, orderNumber: string) {
    this.logger.log(`Broadcasting order status changed: ${orderNumber} -> ${status}`);
    this.emitToAll('order:status_changed', { orderId, status, orderNumber });
  }

  // Result events
  notifyResultCreated(result: any) {
    this.logger.log(`Broadcasting result created: ${result.testCode}`);
    this.emitToAll('result:created', result);
    
    // Send critical result alert to lab techs and admins
    if (result.flag === 'critical_high' || result.flag === 'critical_low') {
      this.emitToRole('lab_tech', 'result:critical', result);
      this.emitToRole('admin', 'result:critical', result);
    }
  }

  notifyResultVerified(result: any) {
    this.logger.log(`Broadcasting result verified: ${result.testCode}`);
    this.emitToAll('result:verified', result);
  }

  // Patient events
  notifyPatientCreated(patient: any) {
    this.logger.log(`Broadcasting patient created: ${patient.patientId}`);
    this.emitToAll('patient:created', patient);
  }

  // Sample events
  notifySampleCollected(sample: any) {
    this.logger.log(`Broadcasting sample collected`);
    this.emitToRole('lab_tech', 'sample:collected', sample);
    this.emitToRole('admin', 'sample:collected', sample);
  }

  // Machine events
  notifyMachineStatusChanged(machine: any) {
    this.logger.log(`Broadcasting machine status changed: ${machine.name} -> ${machine.status}`);
    this.emitToAll('machine:updated', machine);
  }

  notifyMachineResultReceived(data: { machineId: string; machineName: string; resultCount: number; protocol: string; autoMatched?: boolean; orderId?: string; orderNumber?: string }) {
    this.logger.log(`Broadcasting machine result received from ${data.machineName}: ${data.resultCount} results`);
    this.emitToAll('machine:result_received', data);
  }

  notifyCommunicationLog(log: any) {
    this.logger.log(`Broadcasting new communication log`);
    this.emitToAll('communication-log:new', log);
  }

  notifyUnmatchedResult(result: any) {
    this.logger.log(`Broadcasting unmatched result from ${result.machineName}`);
    this.emitToRole('lab_tech', 'result:unmatched', result);
    this.emitToRole('admin', 'result:unmatched', result);
  }

  notifyOrderSentToMachine(data: { orderId: string; orderNumber: string; machineName: string; success: boolean }) {
    this.logger.log(`Broadcasting order sent to machine: ${data.orderNumber} -> ${data.machineName}`);
    this.emitToAll('order:sent_to_machine', data);
  }

  // Get connected clients count
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  // Get clients by role
  getClientsByRole(role: string): number {
    return Array.from(this.connectedClients.values())
      .filter(client => client.role === role)
      .length;
  }
}
