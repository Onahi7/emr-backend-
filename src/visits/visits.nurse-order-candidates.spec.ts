import { Types } from 'mongoose';
import { VisitStatusEnum } from '../database/schemas/visit.schema';
import { VisitsService } from './visits.service';

describe('VisitsService nurse order candidates', () => {
  it('includes queued and in-consultation visits without depending on queue or payment flags', async () => {
    const branchId = new Types.ObjectId().toString();
    const visits = [
      { visitNumber: 'VIS-20260725-0007', status: VisitStatusEnum.IN_QUEUE },
      { visitNumber: 'VIS-20260725-0008', status: VisitStatusEnum.IN_CONSULTATION },
    ];
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
        $in: [
          VisitStatusEnum.AWAITING_TRIAGE,
          VisitStatusEnum.IN_QUEUE,
          VisitStatusEnum.IN_CONSULTATION,
          VisitStatusEnum.AWAITING_LAB,
          VisitStatusEnum.AWAITING_RESULTS,
          VisitStatusEnum.RESULTS_READY,
          VisitStatusEnum.AWAITING_PHARMACY,
          VisitStatusEnum.AWAITING_DISPENSING,
          VisitStatusEnum.AWAITING_DOCTOR_REVIEW,
          VisitStatusEnum.ADMITTED,
          VisitStatusEnum.REFERRED,
        ],
      },
    });
  });
});
