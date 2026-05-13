import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as net from 'net';
import { Hl7Service } from './hl7.service';
import { Machine } from '../database/schemas/machine.schema';
import { Order } from '../database/schemas/order.schema';
import { OrderTest } from '../database/schemas/order-test.schema';
import { RealtimeGateway } from '../realtime/realtime.gateway';

// MLLP framing characters
const MLLP_START = '\x0B'; // VT (vertical tab)
const MLLP_END = '\x1C\r';  // FS + CR

export interface UnmatchedResult {
  machineId: string;
  machineName: string;
  protocol: string;
  rawMessage: string;
  parsedResults: any[];
  receivedAt: Date;
  position?: number;
  status: 'pending' | 'matched' | 'rejected';
}

@Injectable()
export class TcpListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TcpListenerService.name);
  private servers: Map<string, net.Server> = new Map();
  private unmatchedResults: UnmatchedResult[] = [];

  constructor(
    private readonly hl7Service: Hl7Service,
    @InjectModel(Machine.name) private machineModel: Model<Machine>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(OrderTest.name) private orderTestModel: Model<OrderTest>,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async onModuleInit() {
    // Start TCP listeners for all configured machines
    await this.startAllListeners();
  }

  async onModuleDestroy() {
    // Stop all TCP listeners
    this.stopAllListeners();
  }

  /**
   * Start TCP listeners for all machines with IP/Port configured
   */
  async startAllListeners() {
    const machines = await this.machineModel.find({
      ipAddress: { $exists: true, $ne: null },
      port: { $exists: true, $ne: null },
    });

    for (const machine of machines) {
      if (machine.ipAddress && machine.port) {
        await this.startListener(
          machine._id.toString(),
          machine.name,
          machine.port,
          machine.protocol,
        );
      }
    }

    this.logger.log(`Started ${this.servers.size} TCP listeners`);
  }

  /**
   * Start TCP listener for a specific machine
   */
  async startListener(
    machineId: string,
    machineName: string,
    port: number,
    protocol: string,
  ) {
    if (this.servers.has(machineId)) {
      this.logger.warn(`Listener already running for ${machineName}`);
      return;
    }

    const server = net.createServer((socket) => {
      this.logger.log(`Connection from ${socket.remoteAddress} to ${machineName}`);

      let buffer = '';

      socket.on('data', async (data) => {
        buffer += data.toString();

        // Check for MLLP end marker (\x1C\r) — used by HL7 over TCP
        const hasMLLPEnd = buffer.includes('\x1C\r');
        // Check for ASTM end marker
        const hasASTMEnd = !hasMLLPEnd && buffer.includes('\r\n');

        if (hasMLLPEnd || hasASTMEnd) {
          try {
            // Strip MLLP framing: remove \x0B prefix and \x1C\r suffix
            let cleanMessage = buffer;
            if (hasMLLPEnd) {
              cleanMessage = cleanMessage.replace(/^\x0B/, '');      // strip start
              cleanMessage = cleanMessage.replace(/\x1C\r$/, '');    // strip end
              cleanMessage = cleanMessage.trim();
            }

            await this.handleMessage(machineId, machineName, protocol, cleanMessage, socket);
            buffer = ''; // Clear buffer after processing
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Error processing message: ${errorMessage}`);
            // Send NAK wrapped in MLLP for HL7, plain for ASTM
            if (protocol === 'HL7') {
              const nak = this.hl7Service.generateHL7Ack('0', 'AE');
              socket.write(MLLP_START + nak + MLLP_END);
            } else {
              socket.write('\x15'); // NAK byte
            }
            buffer = '';
          }
        }
      });

      socket.on('error', (error) => {
        this.logger.error(`Socket error for ${machineName}: ${error.message}`);
      });

      socket.on('close', () => {
        this.logger.log(`Connection closed for ${machineName}`);
      });
    });

    server.listen(port, () => {
      this.logger.log(`TCP listener started for ${machineName} on port ${port}`);
    });

    server.on('error', (error: any) => {
      this.logger.error(`Server error for ${machineName}: ${error.message}`);
    });

    this.servers.set(machineId, server);
  }

  /**
   * Handle incoming message from analyzer
   */
  private async handleMessage(
    machineId: string,
    machineName: string,
    protocol: string,
    message: string,
    socket: net.Socket,
  ) {
    this.logger.log(`Received message from ${machineName}`);

    // Parse message based on protocol
    let parsed: any;
    let ack: string;

    if (protocol === 'HL7') {
      parsed = this.hl7Service.parseHL7Message(message);
      ack = this.hl7Service.generateHL7Ack(parsed.messageControlId, 'AA');
    } else if (protocol === 'ASTM' || protocol === 'LIS2_A2') {
      parsed = this.hl7Service.parseASTMMessage(message);
      ack = this.hl7Service.generateASTMAck('ACK');
    } else {
      throw new Error(`Unsupported protocol: ${protocol}`);
    }

    // Try auto-matching by orderId or patientId from the parsed message
    let autoMatched = false;
    let unmatchedResult: UnmatchedResult | null = null;
    const sampleId = parsed.orderId || parsed.patientId;

    if (sampleId && parsed.results && parsed.results.length > 0) {
      autoMatched = await this.tryAutoMatch(machineId, sampleId, parsed.results);
    }

    if (!autoMatched) {
      // Store as unmatched result (waiting for manual matching)
      unmatchedResult = {
        machineId,
        machineName,
        protocol,
        rawMessage: message,
        parsedResults: parsed.results || [],
        receivedAt: new Date(),
        position: this.extractPosition(message),
        status: 'pending',
      };

      this.unmatchedResults.push(unmatchedResult);

      this.logger.log(
        `Stored unmatched result from ${machineName} - ${parsed.results?.length || 0} tests (no auto-match for "${sampleId || 'unknown'}")`,
      );
    } else {
      this.logger.log(
        `Auto-matched result from ${machineName} for sample "${sampleId}" - ${parsed.results?.length || 0} tests`,
      );
    }

    // Send acknowledgment wrapped in MLLP for HL7
    if (protocol === 'HL7') {
      socket.write(MLLP_START + ack + MLLP_END);
    } else {
      socket.write(ack);
    }

    // Update machine status
    const updatedMachine = await this.machineModel.findByIdAndUpdate(machineId, {
      status: 'online',
      lastCommunication: new Date(),
    }, { new: true });

    // Emit real-time events
    if (updatedMachine) {
      this.realtimeGateway.notifyMachineStatusChanged(updatedMachine);
    }
    this.realtimeGateway.notifyMachineResultReceived({
      machineId,
      machineName,
      resultCount: parsed.results?.length || 0,
      protocol,
      autoMatched,
    });
    if (unmatchedResult) {
      this.realtimeGateway.notifyUnmatchedResult(unmatchedResult);
    }
  }

  /**
   * Try to auto-match results to a pending order by sample/order ID
   */
  private async tryAutoMatch(
    machineId: string,
    sampleId: string,
    results: any[],
  ): Promise<boolean> {
    try {
      // Strategy 1: Match by order number
      let order = await this.orderModel.findOne({
        orderNumber: sampleId,
        status: { $in: ['collected', 'processing', 'pending'] },
      });

      // Strategy 2: Match by patient ID in recent pending orders
      if (!order) {
        order = await this.orderModel
          .findOne({
            patientId: sampleId,
            status: { $in: ['collected', 'processing', 'pending'] },
          })
          .sort({ createdAt: -1 });
      }

      // Strategy 3: Match by accession number / sample ID stored in order tests
      if (!order) {
        const orderTest = await this.orderTestModel.findOne({
          accessionNumber: sampleId,
        });
        if (orderTest) {
          order = await this.orderModel.findById(orderTest.get('orderId'));
        }
      }

      if (!order) {
        return false;
      }

      // Store results linked to the order
      await this.hl7Service['storeResults'](
        order._id as Types.ObjectId,
        results,
        machineId,
      );

      this.logger.log(`Auto-matched ${results.length} results to order ${order.orderNumber}`);

      // Emit real-time notification for auto-match
      this.realtimeGateway.notifyMachineResultReceived({
        machineId,
        machineName: 'Auto-matched',
        resultCount: results.length,
        protocol: 'HL7',
        orderId: order._id?.toString(),
        orderNumber: order.orderNumber,
        autoMatched: true,
      });

      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Auto-match failed for sample ${sampleId}: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Extract position/rack number from message if available
   */
  private extractPosition(message: string): number | undefined {
    // Try to extract position from message
    // This is analyzer-specific, may need customization
    const positionMatch = message.match(/Position[:\s]+(\d+)/i);
    if (positionMatch) {
      return parseInt(positionMatch[1]);
    }
    return undefined;
  }

  /**
   * Get all unmatched results
   */
  getUnmatchedResults(): UnmatchedResult[] {
    return this.unmatchedResults.filter((r) => r.status === 'pending');
  }

  /**
   * Get unmatched result by index
   */
  getUnmatchedResult(index: number): UnmatchedResult | undefined {
    return this.unmatchedResults[index];
  }

  /**
   * Match result to order
   */
  async matchResult(
    resultIndex: number,
    orderId: string,
  ): Promise<{ success: boolean; message: string }> {
    const result = this.unmatchedResults[resultIndex];

    if (!result) {
      return { success: false, message: 'Result not found' };
    }

    if (result.status !== 'pending') {
      return { success: false, message: 'Result already processed' };
    }

    try {
      // Store results using existing HL7 service
      // This will link results to the order
      const stored = await this.hl7Service['storeResults'](
        orderId as any,
        result.parsedResults,
        result.machineId,
      );

      // Mark as matched
      result.status = 'matched';

      this.logger.log(`Matched result to order ${orderId} - ${stored.length} tests stored`);

      return {
        success: true,
        message: `Successfully matched ${stored.length} test results`,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error matching result: ${errorMessage}`);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Reject/dismiss unmatched result
   */
  rejectResult(resultIndex: number): boolean {
    const result = this.unmatchedResults[resultIndex];
    if (result && result.status === 'pending') {
      result.status = 'rejected';
      return true;
    }
    return false;
  }

  /**
   * Stop all TCP listeners
   */
  stopAllListeners() {
    this.servers.forEach((server, machineId) => {
      server.close();
      this.logger.log(`Stopped listener for machine ${machineId}`);
    });
    this.servers.clear();
  }

  /**
   * Stop listener for specific machine
   */
  stopListener(machineId: string) {
    const server = this.servers.get(machineId);
    if (server) {
      server.close();
      this.servers.delete(machineId);
      this.logger.log(`Stopped listener for machine ${machineId}`);
    }
  }

  /**
   * Restart listener for specific machine
   */
  async restartListener(machineId: string) {
    this.stopListener(machineId);

    const machine = await this.machineModel.findById(machineId);
    if (machine && machine.ipAddress && machine.port) {
      await this.startListener(
        machine._id.toString(),
        machine.name,
        machine.port,
        machine.protocol,
      );
    }
  }

  /**
   * Get status of all TCP listeners
   */
  getListenerStatus(): Array<{ machineId: string; listening: boolean }> {
    const statuses: Array<{ machineId: string; listening: boolean }> = [];
    this.servers.forEach((server, machineId) => {
      statuses.push({ machineId, listening: server.listening });
    });
    return statuses;
  }
}
