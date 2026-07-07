import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserRoleDto {
  @ApiProperty({ enum: UserRole, example: UserRole.PROPRIETAIRE })
  @IsEnum(UserRole, { message: 'Rôle invalide. Valeurs acceptées : CLIENT, PROPRIETAIRE, ADMIN.' })
  role: UserRole;
}
