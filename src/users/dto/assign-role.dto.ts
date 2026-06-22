import { IsEnum, IsMongoId, IsNotEmpty } from 'class-validator';
import { UserRoleEnum } from '../../database/schemas/user-role.schema';

export class AssignRoleDto {
  @IsMongoId()
  @IsNotEmpty()
  userId: string;

  @IsEnum(UserRoleEnum)
  @IsNotEmpty()
  role: UserRoleEnum;
}
