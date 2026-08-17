import { ValidationPipe, BadRequestException, ArgumentMetadata } from '@nestjs/common';
import { RegisterProprietaireDto } from './register-proprietaire.dto';

/**
 * Reproduit exactement la configuration du ValidationPipe global (main.ts) :
 * whitelist + forbidNonWhitelisted. C'est cette combinaison qui garantit qu'un
 * champ `role` injecté dans le payload public d'inscription est REJETÉ (400),
 * pas simplement ignoré — un attaquant ne peut donc jamais se faire passer
 * pour ADMIN via ce endpoint.
 */
function buildPipe() {
  return new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
}

const metadata: ArgumentMetadata = { type: 'body', metatype: RegisterProprietaireDto, data: '' };

const validPayload = {
  firstName: 'Kouassi',
  lastName: 'Yao',
  email: 'proprietaire@example.com',
  phone: '0102030405',
  password: 'MotDePasse123',
  passwordConfirmation: 'MotDePasse123',
  contractAccepted: true,
  contractVersion: 'v10',
};

describe('RegisterProprietaireDto — cloisonnement des rôles à l\'inscription', () => {
  it('accepte un payload valide sans champ role', async () => {
    await expect(buildPipe().transform({ ...validPayload }, metadata)).resolves.toBeDefined();
  });

  it('REJETTE toute tentative d\'injection de role:"ADMIN" dans le payload public', async () => {
    const malicious = { ...validPayload, role: 'ADMIN' };
    await expect(buildPipe().transform(malicious, metadata)).rejects.toThrow(BadRequestException);
  });

  it('REJETTE toute tentative d\'injection de role:"PROPRIETAIRE" (le champ n\'existe simplement pas dans le DTO)', async () => {
    const malicious = { ...validPayload, role: 'PROPRIETAIRE' };
    await expect(buildPipe().transform(malicious, metadata)).rejects.toThrow(BadRequestException);
  });

  it('rejette contractAccepted: false (case obligatoire non cochée)', async () => {
    const payload = { ...validPayload, contractAccepted: false };
    await expect(buildPipe().transform(payload, metadata)).rejects.toThrow(BadRequestException);
  });

  it('rejette contractAccepted absent', async () => {
    const { contractAccepted, ...payload } = validPayload;
    await expect(buildPipe().transform(payload, metadata)).rejects.toThrow(BadRequestException);
  });

  it('rejette une confirmation de mot de passe différente', async () => {
    const payload = { ...validPayload, passwordConfirmation: 'AutreChose123' };
    await expect(buildPipe().transform(payload, metadata)).rejects.toThrow(BadRequestException);
  });

  it('rejette un numéro de téléphone non ivoirien', async () => {
    const payload = { ...validPayload, phone: '0033123456789' };
    await expect(buildPipe().transform(payload, metadata)).rejects.toThrow(BadRequestException);
  });

  it('accepte un numéro ivoirien avec indicatif +225', async () => {
    const payload = { ...validPayload, phone: '+2250102030405' };
    await expect(buildPipe().transform(payload, metadata)).resolves.toBeDefined();
  });
});
