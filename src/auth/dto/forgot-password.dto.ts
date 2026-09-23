import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'client@example.com' })
  @IsEmail({}, { message: 'Veuillez saisir une adresse email valide' })
  @MaxLength(255)
  email: string;
}
