/**
 * @file src/identity-verification/dto/submit-identity-verification.dto.ts
 * @description DTO pour la soumission des documents d'identité avec support Swagger.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNotEmpty } from 'class-validator';
import { IdentityType } from '@prisma/client';

/**
 * @class SubmitIdentityVerificationDto
 * @description Schéma pour la demande de vérification d'identité utilisateur.
 */
export class SubmitIdentityVerificationDto {
  @ApiProperty({
    example: '1234567890',
    description: "Numéro de la pièce d'identité (CNI, Passeport, etc.)"
  })
  @IsString()
  @IsNotEmpty({ message: "Le numéro de pièce d'identité est requis" })
  identityNumber: string;

  @ApiProperty({
    enum: IdentityType,
    enumName: 'IdentityType', // ✅ Correction cruciale pour Swagger
    example: IdentityType.CNI,
    description: "Type de document d'identité"
  })
  @IsEnum(IdentityType, { message: 'Type de document invalide' })
  identityType: IdentityType;

  @ApiProperty({
    example: 'https://example.com/photos/cni-recto.jpg',
    description: "URL de la photo recto de la pièce d'identité"
  })
  @IsString()
  @IsNotEmpty({ message: 'La photo recto est requise' })
  identityPhotoFront: string;

  @ApiProperty({
    example: 'https://example.com/photos/cni-verso.jpg',
    description: "URL de la photo verso de la pièce d'identité"
  })
  @IsString()
  @IsNotEmpty({ message: 'La photo verso est requise' })
  identityPhotoBack: string;

  @ApiProperty({
    example: 'https://example.com/photos/cni-extra.jpg',
    description: "URL d'une photo supplémentaire si nécessaire",
    required: false
  })
  @IsOptional()
  @IsString()
  identityPhotoExtra?: string;
}
