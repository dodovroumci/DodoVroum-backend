import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { IsIvorianPhone } from '../../common/validators/ivorian-phone.validator';
import { Match } from '../../common/validators/match.validator';

/**
 * DTO d'auto-inscription propriétaire. Ne contient volontairement AUCUN champ
 * `role` : combiné à `ValidationPipe({ forbidNonWhitelisted: true })` (main.ts),
 * un `role` injecté dans le payload est rejeté (400) plutôt qu'ignoré. Le rôle
 * PROPRIETAIRE est codé en dur dans AuthService.registerProprietaire().
 */
export class RegisterProprietaireDto {
  @ApiProperty({ example: 'Kouassi' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Yao' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'proprietaire@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '0102030405' })
  @IsIvorianPhone()
  phone: string;

  @ApiProperty({ example: 'MotDePasse123' })
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @Matches(/(?=.*[A-Z])(?=.*\d)/, {
    message: 'Le mot de passe doit contenir au moins une majuscule et un chiffre',
  })
  password: string;

  @ApiProperty({ example: 'MotDePasse123' })
  @IsString()
  @Match('password', { message: 'La confirmation du mot de passe ne correspond pas' })
  passwordConfirmation: string;

  @ApiProperty({ example: true, description: 'Doit être strictement true : acceptation obligatoire du contrat' })
  @Equals(true, { message: 'Vous devez accepter le contrat de partenariat pour vous inscrire' })
  contractAccepted: boolean;

  @ApiProperty({
    example: 'v10',
    required: false,
    description: "Version du contrat affichée côté client, utilisée uniquement pour détecter un décalage — jamais stockée telle quelle.",
  })
  @IsOptional()
  @IsString()
  contractVersion?: string;
}
