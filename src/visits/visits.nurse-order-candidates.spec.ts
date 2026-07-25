import { Types } from 'mongoose';
import { VisitStatusEnum } from '../database/schemas/visit.schema';
import { VisitsService } from './visits.service';

describe('VisitsService nurse order candidates', () => {
  it('uses active visit status and branch scope without depending on queue or payment flags', async () => {
    const branchId = new Types.ObjectId().toString();
    const visits = [{ visitNumber: 'VIS-20260725-0007', status: VisitStatusEnum.IN_QUEUE }];
    const query = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(visits),
    };
    const visitModel = { find: jest.fn().mockReturnValue(query) };
    const service = new VisitsService(
      visitModel as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.getNurseOrderCandidates(branchId)).resolves.toEqual(visits);
    expect(visitModel.find).toHaveBeenCalledWith({
      branchId,
      status: {
        $nin: [
          VisitStatusEnum.WAITING_PAYMENT,
          VisitStatusEnum.COMPLETED,
          VisitStatusEnum.CANCELLED,
        ],
      },
    });
  });
});
