import { Injectable } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class BranchContextService {
  getBranchId(req: Request): string | null {
    return (req as any)?.user?.branchId || (req as any)?.branchId || null;
  }

  requireBranchId(req: Request): string {
    const branchId = this.getBranchId(req);
    if (!branchId) {
      throw new Error('Branch ID not found in request context');
    }
    return branchId;
  }
}
