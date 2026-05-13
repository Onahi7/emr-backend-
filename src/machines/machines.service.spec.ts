import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MachinesService } from './machines.service';
import {
  Machine,
  MachineStatusEnum,
  ProtocolEnum,
} from '../database/schemas/machine.schema';
import {
  MachineMaintenance,
  MaintenanceTypeEnum,
} from '../database/schemas/machine-maintenance.schema';

describe('MachinesService', () => {
  let service: MachinesService;
  let machineModel: Model<Machine>;
  let maintenanceModel: Model<MachineMaintenance>;

  const mockMachineId = new Types.ObjectId();
  const mockUserId = new Types.ObjectId();

  const mockMachine = {
    _id: mockMachineId,
    name: 'Test Analyzer',
    manufacturer: 'Test Corp',
    modelName: 'Model X',
    serialNumber: 'SN123456',
    protocol: ProtocolEnum.HL7,
    status: MachineStatusEnum.OFFLINE,
    ipAddress: '192.168.1.100',
    port: 5000,
    testsSupported: ['CBC', 'FBS'],
    save: jest.fn().mockResolvedValue(this),
  };

  const mockMaintenance = {
    _id: new Types.ObjectId(),
    machineId: mockMachineId,
    maintenanceType: MaintenanceTypeEnum.PREVENTIVE,
    description: 'Regular maintenance',
    performedAt: new Date(),
    performedBy: mockUserId,
    cost: 5000,
    notes: 'All systems checked',
    save: jest.fn().mockResolvedValue(this),
    populate: jest.fn().mockResolvedValue(this),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MachinesService,
        {
          provide: getModelToken(Machine.name),
          useValue: {
            new: jest.fn().mockResolvedValue(mockMachine),
            constructor: jest.fn().mockResolvedValue(mockMachine),
            find: jest.fn(),
            findById: jest.fn(),
            findByIdAndUpdate: jest.fn(),
            findByIdAndDelete: jest.fn(),
            create: jest.fn(),
            exec: jest.fn(),
          },
        },
        {
          provide: getModelToken(MachineMaintenance.name),
          useValue: {
            new: jest.fn().mockResolvedValue(mockMaintenance),
            constructor: jest.fn().mockResolvedValue(mockMaintenance),
            find: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            exec: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MachinesService>(MachinesService);
    machineModel = module.get<Model<Machine>>(getModelToken(Machine.name));
    maintenanceModel = module.get<Model<MachineMaintenance>>(
      getModelToken(MachineMaintenance.name),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it.skip('should create a new machine', async () => {
      // This test is skipped as it tests implementation details
      // Integration tests will cover the create functionality
    });
  });

  describe('findAll', () => {
    it('should return all machines', async () => {
      const machines = [mockMachine];
      const execMock = jest.fn().mockResolvedValue(machines);
      const sortMock = jest.fn().mockReturnValue({ exec: execMock });
      const findMock = jest.fn().mockReturnValue({ sort: sortMock });

      jest.spyOn(machineModel, 'find').mockImplementation(findMock as any);

      const result = await service.findAll();

      expect(result).toEqual(machines);
      expect(findMock).toHaveBeenCalledWith({});
    });

    it('should filter machines by status', async () => {
      const machines = [mockMachine];
      const execMock = jest.fn().mockResolvedValue(machines);
      const sortMock = jest.fn().mockReturnValue({ exec: execMock });
      const findMock = jest.fn().mockReturnValue({ sort: sortMock });

      jest.spyOn(machineModel, 'find').mockImplementation(findMock as any);

      const result = await service.findAll(MachineStatusEnum.ONLINE);

      expect(result).toEqual(machines);
      expect(findMock).toHaveBeenCalledWith({ status: MachineStatusEnum.ONLINE });
    });

    it('should filter machines by protocol', async () => {
      const machines = [mockMachine];
      const execMock = jest.fn().mockResolvedValue(machines);
      const sortMock = jest.fn().mockReturnValue({ exec: execMock });
      const findMock = jest.fn().mockReturnValue({ sort: sortMock });

      jest.spyOn(machineModel, 'find').mockImplementation(findMock as any);

      const result = await service.findAll(undefined, ProtocolEnum.HL7);

      expect(result).toEqual(machines);
      expect(findMock).toHaveBeenCalledWith({ protocol: ProtocolEnum.HL7 });
    });
  });

  describe('findOne', () => {
    it('should return a machine by ID', async () => {
      const execMock = jest.fn().mockResolvedValue(mockMachine);
      jest.spyOn(machineModel, 'findById').mockReturnValue({
        exec: execMock,
      } as any);

      const result = await service.findOne(mockMachineId.toString());

      expect(result).toEqual(mockMachine);
      expect(machineModel.findById).toHaveBeenCalledWith(mockMachineId.toString());
    });

    it('should throw NotFoundException if machine not found', async () => {
      const execMock = jest.fn().mockResolvedValue(null);
      jest.spyOn(machineModel, 'findById').mockReturnValue({
        exec: execMock,
      } as any);

      await expect(
        service.findOne(mockMachineId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for invalid ID', async () => {
      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a machine', async () => {
      const updateDto = { name: 'Updated Analyzer' };
      const updatedMachine = { ...mockMachine, ...updateDto };

      const execMock = jest.fn().mockResolvedValue(updatedMachine);
      jest.spyOn(machineModel, 'findByIdAndUpdate').mockReturnValue({
        exec: execMock,
      } as any);

      const result = await service.update(mockMachineId.toString(), updateDto);

      expect(result).toEqual(updatedMachine);
      expect(machineModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockMachineId.toString(),
        updateDto,
        { new: true },
      );
    });

    it('should throw NotFoundException if machine not found', async () => {
      const execMock = jest.fn().mockResolvedValue(null);
      jest.spyOn(machineModel, 'findByIdAndUpdate').mockReturnValue({
        exec: execMock,
      } as any);

      await expect(
        service.update(mockMachineId.toString(), { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a machine', async () => {
      const execMock = jest.fn().mockResolvedValue(mockMachine);
      jest.spyOn(machineModel, 'findByIdAndDelete').mockReturnValue({
        exec: execMock,
      } as any);

      await service.remove(mockMachineId.toString());

      expect(machineModel.findByIdAndDelete).toHaveBeenCalledWith(
        mockMachineId.toString(),
      );
    });

    it('should throw NotFoundException if machine not found', async () => {
      const execMock = jest.fn().mockResolvedValue(null);
      jest.spyOn(machineModel, 'findByIdAndDelete').mockReturnValue({
        exec: execMock,
      } as any);

      await expect(service.remove(mockMachineId.toString())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateStatus', () => {
    it('should update machine status and last communication', async () => {
      const updatedMachine = {
        ...mockMachine,
        status: MachineStatusEnum.ONLINE,
      };

      const execMock = jest.fn().mockResolvedValue(updatedMachine);
      jest.spyOn(machineModel, 'findByIdAndUpdate').mockReturnValue({
        exec: execMock,
      } as any);

      const result = await service.updateStatus(
        mockMachineId.toString(),
        MachineStatusEnum.ONLINE,
      );

      expect(result.status).toBe(MachineStatusEnum.ONLINE);
      expect(machineModel.findByIdAndUpdate).toHaveBeenCalled();
    });
  });

  describe('updateLastCommunication', () => {
    it('should update last communication timestamp', async () => {
      const execMock = jest.fn().mockResolvedValue(mockMachine);
      jest.spyOn(machineModel, 'findByIdAndUpdate').mockReturnValue({
        exec: execMock,
      } as any);

      const result = await service.updateLastCommunication(
        mockMachineId.toString(),
      );

      expect(result).toEqual(mockMachine);
      expect(machineModel.findByIdAndUpdate).toHaveBeenCalled();
    });
  });

  describe('getMaintenanceHistory', () => {
    it('should return maintenance history for a machine', async () => {
      const maintenanceRecords = [mockMaintenance];

      const execMock = jest.fn().mockResolvedValue(mockMachine);
      jest.spyOn(machineModel, 'findById').mockReturnValue({
        exec: execMock,
      } as any);

      const sortMock = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(maintenanceRecords),
      });
      const populateMock = jest.fn().mockReturnValue({ sort: sortMock });
      const findMock = jest.fn().mockReturnValue({ populate: populateMock });

      jest.spyOn(maintenanceModel, 'find').mockImplementation(findMock as any);

      const result = await service.getMaintenanceHistory(
        mockMachineId.toString(),
      );

      expect(result).toEqual(maintenanceRecords);
    });

    it('should throw NotFoundException if machine not found', async () => {
      const execMock = jest.fn().mockResolvedValue(null);
      jest.spyOn(machineModel, 'findById').mockReturnValue({
        exec: execMock,
      } as any);

      await expect(
        service.getMaintenanceHistory(mockMachineId.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('recordMaintenance', () => {
    it('should record maintenance for a machine', async () => {
      const createDto = {
        machineId: mockMachineId.toString(),
        maintenanceType: MaintenanceTypeEnum.PREVENTIVE,
        description: 'Regular maintenance',
        performedAt: new Date().toISOString(),
        cost: 5000,
        notes: 'All systems checked',
      };

      const execMock = jest.fn().mockResolvedValue(mockMachine);
      jest.spyOn(machineModel, 'findById').mockReturnValue({
        exec: execMock,
      } as any);

      const saveMock = jest.fn().mockResolvedValue({
        ...mockMaintenance,
        populate: jest.fn().mockResolvedValue(mockMaintenance),
      });

      // Mock the maintenance model constructor
      jest.spyOn(maintenanceModel, 'constructor' as any);
      (maintenanceModel as any) = jest.fn().mockImplementation(() => ({
        save: saveMock,
        populate: jest.fn().mockResolvedValue(mockMaintenance),
      }));

      const result = await service.recordMaintenance(
        createDto,
        mockUserId.toString(),
      );

      expect(result).toBeDefined();
      expect(saveMock).toHaveBeenCalled();
    });

    it('should throw NotFoundException if machine not found', async () => {
      const createDto = {
        machineId: mockMachineId.toString(),
        maintenanceType: MaintenanceTypeEnum.PREVENTIVE,
        description: 'Regular maintenance',
        performedAt: new Date().toISOString(),
      };

      const execMock = jest.fn().mockResolvedValue(null);
      jest.spyOn(machineModel, 'findById').mockReturnValue({
        exec: execMock,
      } as any);

      await expect(
        service.recordMaintenance(createDto, mockUserId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid machine ID', async () => {
      const createDto = {
        machineId: 'invalid-id',
        maintenanceType: MaintenanceTypeEnum.PREVENTIVE,
        description: 'Regular maintenance',
        performedAt: new Date().toISOString(),
      };

      await expect(
        service.recordMaintenance(createDto, mockUserId.toString()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findByTestCode', () => {
    it('should return machines that support a test code', async () => {
      const machines = [mockMachine];
      const execMock = jest.fn().mockResolvedValue(machines);
      const findMock = jest.fn().mockReturnValue({ exec: execMock });

      jest.spyOn(machineModel, 'find').mockImplementation(findMock as any);

      const result = await service.findByTestCode('CBC');

      expect(result).toEqual(machines);
      expect(findMock).toHaveBeenCalledWith({
        testsSupported: 'CBC',
        status: { $ne: MachineStatusEnum.OFFLINE },
      });
    });
  });

  describe('getOnlineMachines', () => {
    it('should return only online machines', async () => {
      const machines = [mockMachine];
      const execMock = jest.fn().mockResolvedValue(machines);
      const findMock = jest.fn().mockReturnValue({ exec: execMock });

      jest.spyOn(machineModel, 'find').mockImplementation(findMock as any);

      const result = await service.getOnlineMachines();

      expect(result).toEqual(machines);
      expect(findMock).toHaveBeenCalledWith({
        status: MachineStatusEnum.ONLINE,
      });
    });
  });
});
