import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNotEmpty } from 'class-validator';
import { IdentityType } from '@prisma/client';

export class SubmitIdentityVerificationDto {
  @ApiProperty({ 
    example: '1234567890',
    description: 'Numéro de la pièce d\'identité (CNI, Passeport, etc.)'
  })
  @IsString()
  @IsNotEmpty({ message: 'Le numéro de pièce d\'identité est requis' })
  identityNumber: string;

  @ApiProperty({ 
    enum: IdentityType,
    example: IdentityType.CNI,
    description: 'Type de document d\'identité'
  })
  @IsEnum(IdentityType, { message: 'Type de document invalide' })
  identityType: IdentityType;

  @ApiProperty({ 
    example: 'https://example.com/photos/cni-recto.jpg',
    description: 'URL de la photo recto de la pièce d\'identité'
  })
  @IsString()
  @IsNotEmpty({ message: 'La photo recto est requise' })
  identityPhotoFront: string;

  @ApiProperty({ 
    example: 'https://example.com/photos/cni-verso.jpg',
    description: 'URL de la photo verso de la pièce d\'identité'
  })
  @IsString()
  @IsNotEmpty({ message: 'La photo verso est requise' })
  identityPhotoBack: string;

  @ApiProperty({ 
    example: 'https://example.com/photos/cni-extra.jpg',
    description: 'URL d\'une photo supplémentaire si nécessaire',
    required: false
  })
  @IsOptional()
  @IsString()
  identityPhotoExtra?: string;
}

