import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { CURRENT_PARTNER_CONTRACT_VERSION } from './constants/contract';

describe('AuthService.registerProprietaire — cloisonnement des rôles', () => {
  let authService: AuthService;
  let usersService: { createOwnerSelfRegistration: jest.Mock; updateRefreshTokenHash: jest.Mock };
  let mailService: { sendOwnerWelcomeEmail: jest.Mock };

  const createdUser = {
    id: 'user-1',
    email: 'proprietaire@example.com',
    firstName: 'Kouassi',
    lastName: 'Yao',
    role: 'PROPRIETAIRE',
  };

  beforeEach(async () => {
    usersService = {
      createOwnerSelfRegistration: jest.fn().mockResolvedValue(createdUser),
      updateRefreshTokenHash: jest.fn().mockResolvedValue(undefined),
    };
    mailService = {
      sendOwnerWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: MailService, useValue: mailService },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('signed-token') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string, fallback?: any) => fallback ?? 'test-secret') },
        },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  it('force toujours le rôle PROPRIETAIRE, quel que soit ce qui a été envoyé au DTO', async () => {
    await authService.registerProprietaire({
      firstName: 'Kouassi',
      lastName: 'Yao',
      email: 'proprietaire@example.com',
      phone: '0102030405',
      password: 'MotDePasse123',
      passwordConfirmation: 'MotDePasse123',
      contractAccepted: true,
      // Même si un attaquant a réussi à faire passer un champ role plus haut
      // dans la chaîne (ce qui n'arrive pas grâce au ValidationPipe), le
      // service n'en tient jamais compte : il ne lit que firstName/lastName/
      // email/phone/password depuis le DTO.
      ...({ role: 'ADMIN' } as any),
    } as any);

    expect(usersService.createOwnerSelfRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Kouassi',
        lastName: 'Yao',
        email: 'proprietaire@example.com',
        phone: '0102030405',
        password: 'MotDePasse123',
      }),
    );
    // Le payload transmis à UsersService ne doit contenir AUCUN champ role,
    // c'est UsersService.createOwnerSelfRegistration seul qui décide du rôle.
    const callArg = usersService.createOwnerSelfRegistration.mock.calls[0][0];
    expect(callArg.role).toBeUndefined();
  });

  it("retourne un access_token + refresh_token (auto-login) après inscription", async () => {
    const result = await authService.registerProprietaire({
      firstName: 'Kouassi',
      lastName: 'Yao',
      email: 'proprietaire@example.com',
      phone: '0102030405',
      password: 'MotDePasse123',
      passwordConfirmation: 'MotDePasse123',
      contractAccepted: true,
    } as any);

    expect(result.access_token).toBe('signed-token');
    expect(result.refresh_token).toBe('signed-token');
    expect(result.user).toEqual(createdUser);
  });

  it("ne bloque jamais l'inscription si l'envoi d'email échoue", async () => {
    mailService.sendOwnerWelcomeEmail.mockRejectedValue(new Error('SMTP down'));

    await expect(
      authService.registerProprietaire({
        firstName: 'Kouassi',
        lastName: 'Yao',
        email: 'proprietaire@example.com',
        phone: '0102030405',
        password: 'MotDePasse123',
        passwordConfirmation: 'MotDePasse123',
        contractAccepted: true,
      } as any),
    ).resolves.toBeDefined();
  });
});
