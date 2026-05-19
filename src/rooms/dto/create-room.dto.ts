import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { RoomTypeEnum } from '../../database/schemas/room.schema';

export class CreateRoomDto {
  @IsString()
  name: string;

  @IsEnum(RoomTypeEnum)
  roomType: RoomTypeEnum;

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
