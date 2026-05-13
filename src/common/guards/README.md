# Authorization Guards

This directory contains guards for implementing role-based access control (RBAC) in the NestJS backend.

## RolesGuard

The `RolesGuard` is used to restrict access to routes based on user roles.

### Usage

#### 1. Import Required Decorators and Guards

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRoleEnum } from '../../database/schemas/user-role.schema';
```

#### 2. Apply Guards to Controller or Route

**Option A: Apply to entire controller**

```typescript
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRoleEnum.ADMIN)
export class AdminController {
  // All routes in this controller require admin role
  
  @Get('users')
  getAllUsers() {
    return 'List of all users';
  }
}
```

**Option B: Apply to specific routes**

```typescript
@Controller('orders')
export class OrdersController {
  // Public route - no authentication required
  @Get('public')
  getPublicOrders() {
    return 'Public orders';
  }

  // Authenticated route - any logged-in user
  @Get('my-orders')
  @UseGuards(JwtAuthGuard)
  getMyOrders() {
    return 'My orders';
  }

  // Role-restricted route - only receptionists
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.RECEPTIONIST)
  createOrder() {
    return 'Create order';
  }

  // Multiple roles allowed - receptionist OR admin
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.RECEPTIONIST, UserRoleEnum.ADMIN)
  deleteOrder() {
    return 'Delete order';
  }
}
```

### Available Roles

The system supports three roles defined in `UserRoleEnum`:

- `UserRoleEnum.ADMIN` - Administrator with full access
- `UserRoleEnum.LAB_TECH` - Laboratory technician
- `UserRoleEnum.RECEPTIONIST` - Reception staff

### How It Works

1. **JwtAuthGuard** must be applied first to authenticate the user and populate `request.user`
2. **RolesGuard** then checks if the authenticated user has any of the required roles
3. If the user has at least one of the required roles, access is granted
4. If the user doesn't have any required roles, a `403 Forbidden` exception is thrown

### Request User Object

After successful authentication, the `request.user` object contains:

```typescript
{
  userId: string;      // MongoDB ObjectId as string
  email: string;       // User's email
  roles: string[];     // Array of user roles
}
```

### Error Responses

**No authentication (missing or invalid token):**
```json
{
  "statusCode": 401,
  "message": "Invalid or expired token",
  "error": "Unauthorized"
}
```

**Insufficient permissions:**
```json
{
  "statusCode": 403,
  "message": "Access denied - requires one of the following roles: admin",
  "error": "Forbidden"
}
```

### Logging

The RolesGuard logs authorization events:

- **Debug**: Successful authorization with user ID and roles
- **Warn**: Failed authorization attempts with user ID, required roles, and user roles

### Best Practices

1. **Always apply JwtAuthGuard before RolesGuard**
   ```typescript
   @UseGuards(JwtAuthGuard, RolesGuard)  // ✅ Correct order
   @UseGuards(RolesGuard, JwtAuthGuard)  // ❌ Wrong order
   ```

2. **Use specific roles when possible**
   ```typescript
   @Roles(UserRoleEnum.ADMIN)  // ✅ Specific
   @Roles()                     // ❌ No roles specified (allows all)
   ```

3. **Combine multiple roles for flexible access**
   ```typescript
   @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)  // ✅ Either role works
   ```

4. **Document role requirements in API documentation**
   ```typescript
   /**
    * Delete a user account
    * @requires Admin role
    */
   @Delete(':id')
   @UseGuards(JwtAuthGuard, RolesGuard)
   @Roles(UserRoleEnum.ADMIN)
   deleteUser() { }
   ```

### Testing

To test role-based access:

1. Login as a user with the required role
2. Include the JWT token in the Authorization header
3. Make a request to the protected endpoint

```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'

# Use the returned token
curl -X GET http://localhost:3000/admin/users \
  -H "Authorization: Bearer <access_token>"
```

### Example: Complete Controller

```typescript
import { Controller, Get, Post, Delete, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRoleEnum } from '../../database/schemas/user-role.schema';

@Controller('users')
export class UsersController {
  // Public endpoint - no authentication
  @Get('count')
  getUserCount() {
    return { count: 100 };
  }

  // Authenticated endpoint - any logged-in user
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req: any) {
    return req.user;
  }

  // Admin-only endpoint
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  getAllUsers() {
    return 'List of all users';
  }

  // Admin-only endpoint
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  createUser() {
    return 'User created';
  }

  // Admin or Lab Tech can access
  @Get('lab-staff')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  getLabStaff() {
    return 'Lab staff list';
  }
}
```
