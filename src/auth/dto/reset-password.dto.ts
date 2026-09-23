import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Même règle de mot de passe que l'inscription (RegisterDto). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token reçu dans le lien de réinitialisation' })
  @IsString()
  @IsNotEmpty({ message: 'Ce lien est invalide ou a expiré. Demandez-en un nouveau.' })
  @MaxLength(256)
  token: string;

  @ApiProperty({ example: 'nouveauMotDePasse' })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: 'Le mot de passe ne peut pas dépasser 128 caractères' })
  password: string;
}
