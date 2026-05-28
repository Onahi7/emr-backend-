import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const BRANCH_KEY = 'branch';
export const RequireBranch = () => Reflect.metadata(BRANCH_KEY, true);

@Injectable()
export class BranchGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresBranch = this.reflector.getAllAndOverride<boolean>(BRANCH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Admin users can access all branches
    if (user.roles?.includes('admin')) {
      return true;
    }

    // Check if branchId is required
    if (requiresBranch && !user.branchId) {
      throw new UnauthorizedException('Branch selection required. Please select a branch first.');
    }

    // Attach branchId to request for services to use
    if (user.branchId) {
      request.branchId = user.branchId;
    }

    return true;
  }
}
