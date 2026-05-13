# Laboratory Information System - Backend

A comprehensive Laboratory Information System (LIS) backend built with NestJS, MongoDB, and real-time analyzer integration.

## Features

- 🔐 **Authentication & Authorization** - JWT-based auth with role-based access control
- 👥 **User Management** - Admin, Lab Tech, and Receptionist roles
- 🧪 **Test Catalog Management** - Comprehensive test and panel management
- 📋 **Order Management** - Complete order lifecycle from creation to completion
- 🔬 **Analyzer Integration** - TCP/IP listeners for HL7, ASTM, and LIS2-A2 protocols
- 📊 **Result Management** - Automated result import with manual matching
- 🏥 **Patient Management** - Full patient registration and tracking
- 💰 **Payment Processing** - Multiple payment methods support
- 📈 **Real-time Updates** - WebSocket support for live notifications
- 📝 **Audit Logging** - Complete audit trail for all operations
- 🔧 **Machine Management** - Monitor and manage laboratory analyzers

## Tech Stack

- **Framework**: NestJS
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT + Passport
- **Real-time**: Socket.IO
- **Protocols**: HL7, ASTM, LIS2-A2
- **Validation**: class-validator
- **Testing**: Jest

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB 6+
- pnpm (recommended) or npm

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Configure your MongoDB connection in .env
```

### Database Setup

```bash
# Seed admin user
pnpm run seed:admin

# Seed test catalog
pnpm run seed:tests

# Seed laboratory machines
pnpm run seed:machines
```

### Running the Application

```bash
# Development
pnpm run start:dev

# Production
pnpm run build
pnpm run start:prod
```

The API will be available at `http://localhost:3000`

## Analyzer Integration

The system supports automated result import from laboratory analyzers:

1. **ZYBIO EXC 200** (Hematology) - Port 5000
2. **ZYBIO Z52** (Chemistry) - Port 5001
3. **WONDFO Finecare PLUS** (Immunoassay)

TCP listeners start automatically when the server runs. See `ANALYZER_INTEGRATION_GUIDE.md` for setup instructions.

## API Documentation

Once running, visit:
- Swagger UI: `http://localhost:3000/api`
- Health Check: `http://localhost:3000/health`

## Project Structure

```
src/
├── auth/           # Authentication & authorization
├── users/          # User management
├── patients/       # Patient management
├── orders/         # Order management
├── results/        # Result management
├── samples/        # Sample tracking
├── test-catalog/   # Test catalog management
├── machines/       # Machine management
├── hl7/            # HL7/ASTM protocol handlers
├── reports/        # Report generation
├── qc/             # Quality control
├── audit/          # Audit logging
├── realtime/       # WebSocket gateway
├── database/       # Database schemas & seeds
└── common/         # Shared utilities
```

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `JWT_REFRESH_SECRET` - Refresh token secret
- `PORT` - Server port (default: 3000)

## Scripts

```bash
pnpm run start:dev      # Start development server
pnpm run build          # Build for production
pnpm run test           # Run tests
pnpm run seed:admin     # Seed admin user
pnpm run seed:tests     # Seed test catalog
pnpm run seed:machines  # Seed laboratory machines
```

## License

Proprietary - Hobour Diagnostics

## Support

For issues or questions, contact the development team.
