import { PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsString, IsBoolean } from 'class-validator';

/**
 * @class UpdateUserDto
 * @description Étend CreateUserDto pour rendre tous les champs optionnels
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsString()
  avatar?: string;

  // On s'assure que ces champs sont explicitement autorisés lors de l'update
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
