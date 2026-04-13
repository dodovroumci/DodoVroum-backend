import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, IsEnum, MinLength, IsBoolean } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: '+2250707070707', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: UserRole.CLIENT, required: false })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: 'https://avatar.url', required: false })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({ example: 'Individuel', required: false })
  @IsOptional()
  @IsString()
  typeProprietaire?: string;

  @ApiProperty({ example: 'Abidjan', required: false })
  @IsOptional()
  @IsString()
  localisation?: string;

  // --- NOUVEAUX CHAMPS : VÉRIFICATION D'IDENTITÉ ---

  @ApiProperty({ example: 'CNI', required: false, description: 'Type de pièce (CNI, Passeport, etc.)' })
  @IsOptional()
  @IsString()
  identityType?: string;

  @ApiProperty({ example: '123456789', required: false, description: 'Numéro de la pièce d’identité' })
  @IsOptional()
  @IsString()
  identityNumber?: string;

  @ApiProperty({ example: 'https://api.url/photo_front.jpg', required: false })
  @IsOptional()
  @IsString()
  identityPhotoFront?: string;

  @ApiProperty({ example: 'https://api.url/photo_back.jpg', required: false })
  @IsOptional()
  @IsString()
  identityPhotoBack?: string;

  @ApiProperty({ example: 'https://api.url/photo_extra.jpg', required: false })
  @IsOptional()
  @IsString()
  identityPhotoExtra?: string;
}
