import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { VisitStatusEnum } from '../database/schemas/visit.schema';
import { VisitsService } from './visits.service';

describe('VisitsService clinical integrity', () => {
  const branchId = new Types.ObjectId();
  const actorId = new Types.ObjectId();
  const doctorId = new Types.ObjectId();
  const visitId = new Types.ObjectId();
  const patientId = new Types.ObjectId();

  const makeQuery = <T>(value: T) => ({ session: jest.fn().mockResolvedValue(value) });

  const makeService = (options?: { soapSaveError?: Error; assignedDoctorId?: Types.ObjectId; linkedDoctorId?: Types.ObjectId }) => {
    const session = {
      withTransaction: jest.fn(async (callback: () => Promise<void>) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    const visit: any = {
      _id: visitId,
      branchId,
      patientId,
      doctorId: options?.assignedDoctorId || doctorId,
      consultationPaid: true,
      status: VisitStatusEnum.IN_CONSULTATION,
      visitNumber: 'VIS-TEST-0001',
      save: jest.fn().mockImplementation(async function () { return this; }),
    };
    const orderQuery = {
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    const visitModel: any = {
      findOne: jest.fn().mockReturnValue(makeQuery(visit)),
      db: {
        startSession: jest.fn().mockResolvedValue(session),
        model: jest.fn((name: string) => name === 'Order'
          ? { find: jest.fn().mockReturnValue(orderQuery) }
          : { findOneAndUpdate: jest.fn().mockResolvedValue(null) }),
      },
    };
    const noteSave = options?.soapSaveError
      ? jest.fn().mockRejectedValue(options.soapSaveError)
      : jest.fn().mockImplementation(async function () { return this; });
    const soapModel: any = jest.fn().mockImplementation((data) => ({ ...data, save: noteSave }));
    soapModel.findOne = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(null) }),
    });
    const realtime = { emitToBranch: jest.fn() };
    const doctorModel: any = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(options?.linkedDoctorId ? { _id: options.linkedDoctorId } : null),
          }),
        }),
      }),
    };
    const service = new VisitsService(
      visitModel,
      {} as any,
      doctorModel,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      soapModel,
      realtime as any,
      {} as any,
      {} as any,
      {} as any, // insuranceClaimsService
    );
    return { service, visit, visitModel, soapModel, noteSave, session, realtime, doctorModel };
  };

  it('rejects clinical drafting by another treating doctor', async () => {
    const { service } = makeService({ assignedDoctorId: new Types.ObjectId() });

    await expect(service.updateClinicalDraft(
      visitId.toString(),
      { subjectiveNotes: 'Unauthorized' },
      { userId: actorId.toString(), doctorId: doctorId.toString(), roles: ['doctor'] },
      branchId.toString(),
    )).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the authenticated doctor to save a legacy visit assigned to their user id', async () => {
    const { service, noteSave } = makeService({ assignedDoctorId: actorId });

    await service.updateClinicalDraft(
      visitId.toString(),
      { subjectiveNotes: 'Legacy assignment remains usable' },
      { userId: actorId.toString(), roles: ['doctor'] },
      branchId.toString(),
    );

    expect(noteSave).toHaveBeenCalled();
  });

  it('resolves a newly linked doctor record when the access token is stale', async () => {
    const { service, noteSave, doctorModel } = makeService({ linkedDoctorId: doctorId });

    await service.updateClinicalDraft(
      visitId.toString(),
      { subjectiveNotes: 'Current doctor link is recognized' },
      { userId: actorId.toString(), roles: ['doctor'] },
      branchId.toString(),
    );

    expect(doctorModel.findOne).toHaveBeenCalled();
    expect(noteSave).toHaveBeenCalled();
  });

  it('propagates SOAP persistence failure and does not complete the visit', async () => {
    const failure = new Error('soap persistence failed');
    const { service, visit } = makeService({ soapSaveError: failure });

    await expect(service.complete(
      visitId.toString(),
      { subjectiveNotes: 'Latest note', diagnosis: 'J02.9' },
      { userId: actorId.toString(), doctorId: doctorId.toString(), roles: ['doctor'] },
      branchId.toString(),
    )).rejects.toThrow('soap persistence failed');
    expect(visit.status).toBe(VisitStatusEnum.IN_CONSULTATION);
    expect(visit.save).not.toHaveBeenCalled();
  });

  it('saves the canonical draft and preserves an open encounter', async () => {
    const { service, visit, noteSave, realtime } = makeService();

    const result = await service.updateClinicalDraft(
      visitId.toString(),
      { subjectiveNotes: 'Two days of fever', diagnosis: 'J02.9', triageOverridePriority: 'esi_3_urgent' },
      { userId: actorId.toString(), doctorId: doctorId.toString(), roles: ['doctor'] },
      branchId.toString(),
    );

    expect(noteSave).toHaveBeenCalled();
    expect(result.visit.status).toBe(VisitStatusEnum.IN_CONSULTATION);
    expect(result.visit.triageOverridePriority).toBe('esi_3_urgent');
    expect(realtime.emitToBranch).toHaveBeenCalledWith(branchId.toString(), 'visit:updated', visit);
  });
});
