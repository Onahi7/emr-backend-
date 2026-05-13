# Database Module

This module provides MongoDB database connection configuration using Mongoose for the Laboratory Information System (LIS) backend.

## Features

- ✅ **Connection Pooling**: Optimized connection pool management (min: 2, max: 10 connections)
- ✅ **Retry Logic**: Automatic retry for failed read and write operations
- ✅ **Error Handling**: Comprehensive error handling with connection event listeners
- ✅ **Local & Atlas Support**: Works with both local MongoDB and MongoDB Atlas
- ✅ **Health Checks**: Built-in health check service for monitoring
- ✅ **Environment Configuration**: Fully configurable via environment variables

## Requirements

Implements requirements 3.1 through 3.6 from the backend migration specification:
- 3.1: Install and configure Mongoose for MongoDB integration
- 3.2: Create database connection module
- 3.3: Configure connection pooling for optimal performance
- 3.4: Implement connection error handling and retry logic
- 3.5: Support both local MongoDB and MongoDB Atlas
- 3.6: Configure database connection via environment variables

## Configuration

### Environment Variables

Set the following environment variable in your `.env` file:

```bash
# Local MongoDB
MONGODB_URI=mongodb://localhost:27017/lis_dev

# MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/lis?retryWrites=true&w=majority
```

### Connection Options

The module is configured with the following options:

- **maxPoolSize**: 10 (maximum connections in pool)
- **minPoolSize**: 2 (minimum connections to maintain)
- **serverSelectionTimeoutMS**: 5000 (5 seconds)
- **socketTimeoutMS**: 45000 (45 seconds)
- **retryWrites**: true (automatic write retry)
- **retryReads**: true (automatic read retry)
- **maxIdleTimeMS**: 10000 (close idle connections after 10 seconds)
- **w**: 'majority' (write concern for data durability)

## Usage

### Import the Module

```typescript
import { Module } from '@nestjs/common';
import { DatabaseModule } from './database';

@Module({
  imports: [DatabaseModule],
})
export class AppModule {}
```

### Use Mongoose Models

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class PatientsService {
  constructor(
    @InjectModel('Patient') private patientModel: Model<Patient>,
  ) {}

  async findAll(): Promise<Patient[]> {
    return this.patientModel.find().exec();
  }
}
```

### Health Checks

```typescript
import { Injectable } from '@nestjs/common';
import { DatabaseHealthService } from './database';

@Injectable()
export class HealthController {
  constructor(private readonly dbHealth: DatabaseHealthService) {}

  async checkDatabase() {
    return await this.dbHealth.checkHealth();
  }
}
```

## Testing

### Unit Tests

Unit tests do not require a running MongoDB instance:

```bash
# Run unit tests
pnpm test -- database.module.spec.ts
pnpm test -- database-health.service.spec.ts
```

### Integration Tests

Integration tests require a running MongoDB instance:

```bash
# Start MongoDB locally (Docker)
docker run -d -p 27017:27017 --name mongodb mongo:7

# Run integration tests
pnpm test -- database.integration.spec.ts

# Stop MongoDB
docker stop mongodb && docker rm mongodb
```

Alternatively, use MongoDB Atlas by setting the `MONGODB_URI` environment variable to your Atlas connection string.

## Connection Events

The module logs the following connection events:

- ✅ **connected**: Successfully connected to MongoDB
- ⚠️ **disconnected**: Connection lost
- ❌ **error**: Connection error occurred
- 🔄 **reconnected**: Successfully reconnected after disconnection
- ❌ **reconnectFailed**: Failed to reconnect after multiple attempts

## Health Check Service

The `DatabaseHealthService` provides methods to monitor database connectivity:

### Methods

#### `checkHealth()`
Returns detailed health status including connection state, host, port, database name, and pool configuration.

```typescript
const health = await dbHealth.checkHealth();
// {
//   status: 'healthy' | 'unhealthy',
//   details: {
//     connected: boolean,
//     readyState: number,
//     readyStateDescription: string,
//     host: string,
//     port: number,
//     database: string,
//     poolSize: number,
//     minPoolSize: number
//   }
// }
```

#### `ping()`
Pings the database to verify connectivity.

```typescript
const isConnected = await dbHealth.ping(); // true or false
```

#### `getConnectionStats()`
Returns connection statistics including collections and state.

```typescript
const stats = dbHealth.getConnectionStats();
// {
//   readyState: number,
//   connected: boolean,
//   host: string,
//   port: number,
//   database: string,
//   collections: string[]
// }
```

#### `getConnectionInfo()`
Returns detailed connection configuration.

```typescript
const info = dbHealth.getConnectionInfo();
// {
//   state: string,
//   database: string,
//   host: string,
//   port: number,
//   options: { ... }
// }
```

## Troubleshooting

### Connection Refused

If you see `ECONNREFUSED` errors:

1. Ensure MongoDB is running:
   ```bash
   # Check if MongoDB is running
   docker ps | grep mongo
   
   # Or for local installation
   sudo systemctl status mongod
   ```

2. Verify the connection string in `.env`:
   ```bash
   MONGODB_URI=mongodb://localhost:27017/lis_dev
   ```

3. Check firewall settings if using remote MongoDB

### Connection Timeout

If connections timeout:

1. Check network connectivity to MongoDB server
2. Verify MongoDB Atlas IP whitelist (if using Atlas)
3. Increase `serverSelectionTimeoutMS` if needed

### Authentication Failed

If authentication fails:

1. Verify username and password in connection string
2. Ensure user has proper permissions on the database
3. Check if authentication is enabled on MongoDB server

## Production Considerations

### MongoDB Atlas

For production, use MongoDB Atlas with:

- Replica set for high availability
- Automated backups
- Monitoring and alerts
- IP whitelist for security
- Strong authentication credentials

### Connection String Format

```
mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority&ssl=true
```

### Security

- Never commit `.env` files with real credentials
- Use environment variables or secrets management
- Rotate credentials regularly
- Enable SSL/TLS for connections
- Use strong passwords (minimum 16 characters)

### Performance

- Monitor connection pool usage
- Adjust pool size based on load
- Use indexes on frequently queried fields
- Enable query profiling for optimization
- Consider read replicas for read-heavy workloads

## Files

- `database.module.ts` - Main database module with Mongoose configuration
- `database-health.service.ts` - Health check service for monitoring
- `database.module.spec.ts` - Unit tests (no MongoDB required)
- `database-health.service.spec.ts` - Health service unit tests (no MongoDB required)
- `database.integration.spec.ts` - Integration tests (requires MongoDB)
- `index.ts` - Module exports
- `README.md` - This file

## References

- [Mongoose Documentation](https://mongoosejs.com/docs/)
- [NestJS Mongoose Integration](https://docs.nestjs.com/techniques/mongodb)
- [MongoDB Connection String](https://www.mongodb.com/docs/manual/reference/connection-string/)
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
