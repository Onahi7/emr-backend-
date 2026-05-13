import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { UserRoleEnum } from '../../database/schemas/user-role.schema';

export class AssignRoleDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsEnum(UserRoleEnum)
  @IsNotEmpty()
  role: UserRoleEnum;
}
