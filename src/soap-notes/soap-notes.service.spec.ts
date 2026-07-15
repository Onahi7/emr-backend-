import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { SoapNotesService } from './soap-notes.service';

describe('SoapNotesService security boundaries', () => {
  const branchA = new Types.ObjectId();
  const branchB = new Types.ObjectId();
  const actorId = new Types.ObjectId();
  const doctorId = new Types.ObjectId();

  const makeService = () => {
    const soapModel: any = jest.fn().mockImplementation((data) => ({
      ...data,
      save: jest.fn().mockImplementation(async function () { return this; }),
    }));
    soapModel.findById = jest.fn();
    soapModel.findOne = jest.fn();
    soapModel.find = jest.fn();
    const visitModel = { findOne: jest.fn() };
    const patientModel = { findOne: jest.fn() };
    return {
      service: new SoapNotesService(soapModel as any, visitModel as any, patientModel as any),
      soapModel,
      visitModel,
      patientModel,
    };
  };

  it('does not return a note from another branch', async () => {
    const { service, soapModel } = makeService();
    soapModel.findById.mockResolvedValue({ _id: new Types.ObjectId(), branchId: branchB });

    await expect(service.findById(new Types.ObjectId().toString(), branchA.toString())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects edits to a signed note', async () => {
    const { service, soapModel } = makeService();
    soapModel.findById.mockResolvedValue({
      _id: new Types.ObjectId(),
      branchId: branchA,
      isSigned: true,
      save: jest.fn(),
    });

    await expect(
      service.update(
        new Types.ObjectId().toString(),
        { diagnosis: 'Changed diagnosis' },
        branchA.toString(),
        { userId: actorId.toString(), doctorId: doctorId.toString(), roles: ['doctor'] },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('derives signedBy from the authenticated actor', async () => {
    const { service, soapModel } = makeService();
    const note: any = {
      _id: new Types.ObjectId(),
      branchId: branchA,
      isSigned: false,
      save: jest.fn().mockImplementation(async function () { return this; }),
    };
    soapModel.findById.mockResolvedValue(note);

    const signed = await service.sign(
      note._id.toString(),
      branchA.toString(),
      { userId: actorId.toString(), doctorId: doctorId.toString(), roles: ['doctor'] },
    );

    expect(signed.isSigned).toBe(true);
    expect(signed.signedBy.toString()).toBe(actorId.toString());
    expect(note.save).toHaveBeenCalled();
  });

  it('rejects a non-admin actor assigned to another treating doctor', async () => {
    const { service, soapModel, visitModel } = makeService();
    const visitId = new Types.ObjectId();
    soapModel.findById.mockResolvedValue({
      _id: new Types.ObjectId(),
      branchId: branchA,
      visitId,
      isSigned: false,
      save: jest.fn(),
    });
    visitModel.findOne.mockResolvedValue({ _id: visitId, doctorId: new Types.ObjectId() });

    await expect(
      service.update(
        new Types.ObjectId().toString(),
        { diagnosis: 'Unauthorized change' },
        branchA.toString(),
        { userId: actorId.toString(), doctorId: doctorId.toString(), roles: ['doctor'] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates an immutable signed addendum using the authenticated actor', async () => {
    const { service, soapModel } = makeService();
    const originalId = new Types.ObjectId();
    soapModel.findById.mockResolvedValue({
      _id: originalId,
      branchId: branchA,
      patientId: new Types.ObjectId(),
      noteType: 'consultation',
      isSigned: true,
    });

    const addendum = await service.createAddendum(
      originalId.toString(),
      'Correction: symptoms began three days ago.',
      branchA.toString(),
      { userId: actorId.toString(), doctorId: doctorId.toString(), roles: ['doctor'] },
    );

    expect(addendum.addendumTo.toString()).toBe(originalId.toString());
    expect(addendum.isSigned).toBe(true);
    expect(addendum.signedBy.toString()).toBe(actorId.toString());
  });
});
