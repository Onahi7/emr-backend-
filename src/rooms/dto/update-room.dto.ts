import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { RoomStatusEnum, RoomTypeEnum } from '../../database/schemas/room.schema';

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(RoomTypeEnum)
  roomType?: RoomTypeEnum;

  @IsOptional()
  @IsEnum(RoomStatusEnum)
  status?: RoomStatusEnum;

  @IsOptional()
  @IsNumber()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
