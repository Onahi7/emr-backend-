import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Room, RoomStatusEnum, RoomTypeEnum } from '../database/schemas/room.schema';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { Visit, VisitStatusEnum } from '../database/schemas/visit.schema';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { requireBranchId, withBranch } from '../common/utils/branch-scope';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    @InjectModel(Room.name) private roomModel: Model<Room>,
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    private realtimeGateway: RealtimeGateway,
  ) {}

  async create(createRoomDto: CreateRoomDto, branchId?: string): Promise<Room> {
    const requiredBranchId = requireBranchId(branchId);
    const existing = await this.roomModel.findOne(withBranch({ name: createRoomDto.name }, requiredBranchId)).exec();
    if (existing) {
      throw new ConflictException(`Room "${createRoomDto.name}" already exists`);
    }
    const room = new this.roomModel({ ...createRoomDto, branchId: requiredBranchId });
    const saved = await room.save();
    this.logger.log(`Room created: ${saved.name} (${saved.roomType})`);
    return saved;
  }

  async findAll(roomType?: string, status?: string, branchId?: string): Promise<Room[]> {
    const filter: any = withBranch({}, branchId);
    if (roomType) filter.roomType = roomType;
    if (status) filter.status = status;
    return this.roomModel.find(filter).sort({ name: 1 }).lean().exec() as unknown as Room[];
  }

  async findOne(id: string, branchId?: string): Promise<Room> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Room not found');
    const room = await this.roomModel.findOne(withBranch({ _id: id }, branchId)).exec();
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  async update(id: string, updateRoomDto: UpdateRoomDto, branchId?: string): Promise<Room> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Room not found');
    if (updateRoomDto.name) {
      const dup = await this.roomModel.findOne(withBranch({ name: updateRoomDto.name, _id: { $ne: id } }, branchId)).exec();
      if (dup) throw new ConflictException(`Room "${updateRoomDto.name}" already exists`);
    }
    const room = await this.roomModel.findOneAndUpdate(withBranch({ _id: id }, branchId), updateRoomDto, { new: true }).exec();
    if (!room) throw new NotFoundException('Room not found');
    this.realtimeGateway.emitToAll('room:updated', room);
    return room;
  }

  async remove(id: string, branchId?: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Room not found');
    const room = await this.roomModel.findOne(withBranch({ _id: id }, branchId)).exec();
    if (!room) throw new NotFoundException('Room not found');
    if (room.status === RoomStatusEnum.OCCUPIED) {
      throw new BadRequestException('Cannot delete an occupied room');
    }
    await this.roomModel.deleteOne(withBranch({ _id: id }, branchId)).exec();
    this.logger.log(`Room deleted: ${room.name}`);
  }

  async assignRoom(visitId: string, roomId: string, branchId?: string): Promise<{ room: Room; visit: Visit }> {
    if (!Types.ObjectId.isValid(visitId) || !Types.ObjectId.isValid(roomId)) {
      throw new NotFoundException('Invalid visit or room ID');
    }
    const visit = await this.visitModel.findOne(withBranch({ _id: visitId }, branchId)).exec();
    if (!visit) throw new NotFoundException('Visit not found');

    const room = await this.roomModel.findOne(withBranch({ _id: roomId }, branchId)).exec();
    if (!room) throw new NotFoundException('Room not found');
    if (room.status === RoomStatusEnum.OCCUPIED) {
      throw new BadRequestException(`Room "${room.name}" is already occupied`);
    }
    if (room.status === RoomStatusEnum.MAINTENANCE) {
      throw new BadRequestException(`Room "${room.name}" is under maintenance`);
    }

    // Release current room if visit already assigned to one
    if (visit.room) {
      await this.roomModel.findOneAndUpdate(
        withBranch({ name: visit.room }, branchId),
        { status: RoomStatusEnum.AVAILABLE, currentVisitId: null, currentPatientName: null },
      ).exec();
    }

    // Assign new room
    room.status = RoomStatusEnum.OCCUPIED;
    room.currentVisitId = visit._id as Types.ObjectId;
    room.currentPatientName = `${visit._id}`; // Will be updated later if needed
    await room.save();

    visit.room = room.name;
    visit.roomType = room.roomType;
    await visit.save();

    this.realtimeGateway.emitToAll('room:assigned', { visitId, roomId: room._id, roomName: room.name });
    return { room, visit };
  }

  async releaseRoom(roomId: string, branchId?: string): Promise<Room> {
    if (!Types.ObjectId.isValid(roomId)) throw new NotFoundException('Room not found');
    const room = await this.roomModel.findOne(withBranch({ _id: roomId }, branchId)).exec();
    if (!room) throw new NotFoundException('Room not found');

    room.status = RoomStatusEnum.AVAILABLE;
    room.currentVisitId = null;
    room.currentPatientName = null;
    await room.save();

    this.realtimeGateway.emitToAll('room:released', { roomId: room._id, roomName: room.name });
    return room;
  }

  async autoAssignRoom(visitId: string, preferredType?: string, branchId?: string): Promise<{ room?: Room; visit: Visit }> {
    const visit = await this.visitModel.findOne(withBranch({ _id: visitId }, branchId)).exec();
    if (!visit) throw new NotFoundException('Visit not found');

    // If visit already has a room, return it
    if (visit.room) {
      const existingRoom = await this.roomModel.findOne(withBranch({ name: visit.room }, branchId)).exec();
      return { room: existingRoom || undefined, visit };
    }

    // Find available rooms matching preferred type
    const typeToUse = preferredType || visit.roomType || RoomTypeEnum.CONSULTATION;
    const availableRoom = await this.roomModel
      .findOne(withBranch({ roomType: typeToUse, status: RoomStatusEnum.AVAILABLE }, branchId))
      .sort({ name: 1 })
      .exec();

    if (!availableRoom) {
      // Try any available room
      const anyRoom = await this.roomModel
        .findOne(withBranch({ status: RoomStatusEnum.AVAILABLE }, branchId))
        .sort({ name: 1 })
        .exec();
      if (!anyRoom) {
        return { visit };
      }
      return this.assignRoom(visitId, anyRoom._id.toString(), branchId);
    }

    return this.assignRoom(visitId, availableRoom._id.toString(), branchId);
  }

  async seedDefaultRooms(branchId?: string): Promise<number> {
    const requiredBranchId = requireBranchId(branchId);
    const existing = await this.roomModel.countDocuments({ branchId: requiredBranchId }).exec();
    if (existing > 0) return existing;

    const defaults = [
      { name: 'Consultation Room 1', roomType: RoomTypeEnum.CONSULTATION, floor: '1' },
      { name: 'Consultation Room 2', roomType: RoomTypeEnum.CONSULTATION, floor: '1' },
      { name: 'Consultation Room 3', roomType: RoomTypeEnum.CONSULTATION, floor: '1' },
      { name: 'Treatment Room 1', roomType: RoomTypeEnum.TREATMENT, floor: '1' },
      { name: 'Treatment Room 2', roomType: RoomTypeEnum.TREATMENT, floor: '2' },
      { name: 'Procedure Room 1', roomType: RoomTypeEnum.PROCEDURE, floor: '2' },
      { name: 'Emergency Room 1', roomType: RoomTypeEnum.EMERGENCY, floor: '1' },
      { name: 'Observation Bay 1', roomType: RoomTypeEnum.OBSERVATION, floor: '2' },
      { name: 'Observation Bay 2', roomType: RoomTypeEnum.OBSERVATION, floor: '2' },
      { name: 'Triage Room', roomType: RoomTypeEnum.TRIAGE, floor: '1' },
    ];

    await this.roomModel.insertMany(defaults.map(room => ({ ...room, branchId: requiredBranchId })));
    this.logger.log(`Seeded ${defaults.length} default rooms`);
    return defaults.length;
  }
}
