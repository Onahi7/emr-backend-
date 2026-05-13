import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

/**
 * Database Health Service
 * 
 * Provides health check functionality for MongoDB connection
 * Useful for monitoring and debugging connection issues
 * 
 * Requirements: 3.4 (Connection error handling)
 */
@Injectable()
export class DatabaseHealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Check if database connection is healthy
   * @returns Object with connection status and details
   */
  async checkHealth(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      connected: boolean;
      readyState: number;
      readyStateDescription: string;
      host: string;
      port: number;
      database: string;
      poolSize?: number;
      minPoolSize?: number;
    };
  }> {
    const readyState = this.connection.readyState;
    const connected = readyState === 1;

    const readyStateMap: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
      99: 'uninitialized',
    };

    return {
      status: connected ? 'healthy' : 'unhealthy',
      details: {
        connected,
        readyState,
        readyStateDescription: readyStateMap[readyState] || 'unknown',
        host: this.connection.host || 'unknown',
        port: this.connection.port || 0,
        database: this.connection.name || 'unknown',
        poolSize: undefined, // Not available in newer Mongoose
        minPoolSize: undefined, // Not available in newer Mongoose
      },
    };
  }

  /**
   * Ping the database to verify connectivity
   * @returns True if ping successful, false otherwise
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.connection.db?.admin().ping();
      return result?.ok === 1;
    } catch (error) {
      console.error('Database ping failed:', error);
      return false;
    }
  }

  /**
   * Get connection statistics
   * @returns Connection pool and performance statistics
   */
  getConnectionStats(): {
    readyState: number;
    connected: boolean;
    host: string;
    port: number;
    database: string;
    collections: string[];
  } {
    return {
      readyState: this.connection.readyState,
      connected: this.connection.readyState === 1,
      host: this.connection.host || 'unknown',
      port: this.connection.port || 0,
      database: this.connection.name || 'unknown',
      collections: Object.keys(this.connection.collections),
    };
  }

  /**
   * Get detailed connection information
   * @returns Detailed connection configuration and state
   */
  getConnectionInfo(): {
    state: string;
    database: string;
    host: string;
    port: number;
    options: {
      maxPoolSize?: number;
      minPoolSize?: number;
      serverSelectionTimeoutMS?: number;
      socketTimeoutMS?: number;
      retryWrites?: boolean;
      retryReads?: boolean;
      w?: string | number;
    };
  } {
    const readyStateMap: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
      99: 'uninitialized',
    };

    return {
      state: readyStateMap[this.connection.readyState] || 'unknown',
      database: this.connection.name || 'unknown',
      host: this.connection.host || 'unknown',
      port: this.connection.port || 0,
      options: {
        maxPoolSize: undefined, // Not available in newer Mongoose
        minPoolSize: undefined, // Not available in newer Mongoose
        serverSelectionTimeoutMS: undefined,
        socketTimeoutMS: undefined,
        retryWrites: undefined,
        retryReads: undefined,
        w: undefined,
      },
    };
  }
}
