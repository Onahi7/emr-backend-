import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRoleEnum } from '../../database/schemas/user-role.schema';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles from decorator metadata
    const requiredRoles = this.reflector.getAllAndOverride<UserRoleEnum[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles are required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Get user from request (populated by JwtAuthGuard)
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      this.logger.warn('No user found in request - authentication may have failed');
      throw new ForbiddenException('Access denied - authentication required');
    }

    // Check if user has any of the required roles
    const hasRole = requiredRoles.some((role) => user.roles?.includes(role));

    if (!hasRole) {
      this.logger.warn(
        `Access denied for user ${user.userId} - Required roles: [${requiredRoles.join(', ')}], User roles: [${user.roles?.join(', ') || 'none'}]`,
      );
      throw new ForbiddenException(
        `Access denied - requires one of the following roles: ${requiredRoles.join(', ')}`,
      );
    }

    this.logger.debug(
      `Access granted for user ${user.userId} with roles: [${user.roles?.join(', ')}]`,
    );

    return true;
  }
}
