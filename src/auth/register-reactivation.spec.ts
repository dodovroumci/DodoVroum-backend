import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CURRENT_PARTNER_CONTRACT_VERSION } from './constants/contract';

/**
 * Réinscription sur l'email d'un compte supprimé (soft delete) : la ligne est
 * réactivée, jamais recréée. Vrais UsersService / AuthService / AuthController
 * sur une table `users` en mémoire, pour vérifier ce qui reste réellement
 * stocké (l'ancien rôle ne doit pas survivre à une mise à jour partielle).
 */
function createInMemoryPrisma(rows: any[]) {
  const byEmail = (email: string) => rows.find((r) => r.email === email);
  const byId = (id: string) => rows.find((r) => r.id === id);
  const apply = (row: any, data: any) => {
    Object.assign(row, data);
    return { ...row };
  };

  return {
    // Client brut : voit aussi les comptes supprimés.
    $raw: {
      user: {
        findUnique: jest.fn(async ({ where }) => {
          const row = byEmail(where.email);
          return row ? { id: row.id, deletedAt: row.deletedAt } : null;
        }),
        update: jest.fn(async ({ where, data }) => apply(byId(where.id), data)),
      },
    },
    // Client « soft-delete-aware » : les comptes supprimés sont invisibles.
    user: {
      findUnique: jest.fn(async ({ where }) => {
        const row = byEmail(where.email);
        return row && row.deletedAt === null ? { ...row } : null;
      }),
      create: jest.fn(async ({ data }) => {
        const row = {
          id: `new-${rows.length + 1}`,
          role: 'CLIENT',
          isActive: true,
          deletedAt: null,
          typeProprietaire: null,
          contractAcceptedAt: null,
          contractVersion: null,
          ...data,
        };
        rows.push(row);
        return { ...row };
      }),
      update: jest.fn(async ({ where, data }) => apply(byId(where.id), data)),
    },
  };
}

describe("Réinscription sur l'email d'un compte supprimé", () => {
  const email = 'test@dodovroum.ci';
  const newPassword = 'NouveauMotDePasse1';
  const clientRegistration = {
    email,
    password: newPassword,
    firstName: 'Awa',
    lastName: 'Koné',
    phone: '0700000001',
  };

  let rows: any[];
  let authService: AuthService;
  let controller: AuthController;

  const deletedUser = (overrides: Record<string, unknown>) => ({
    id: 'old-1',
    email,
    password: 'ancien-hash',
    firstName: 'Ancien',
    lastName: 'Nom',
    phone: '0700000000',
    isActive: true,
    deletedAt: new Date('2026-09-01'),
    typeProprietaire: null,
    contractAcceptedAt: null,
    contractVersion: null,
    refreshTokenHash: 'ancien-refresh',
    resetPasswordToken: 'ancien-reset',
    resetPasswordExpires: new Date('2026-09-02'),
    ...overrides,
  });

  const deletedOwner = () =>
    deletedUser({
      role: 'PROPRIETAIRE',
      typeProprietaire: 'PARTICULIER',
      contractAcceptedAt: new Date('2026-08-17'),
      contractVersion: 'v1',
    });

  /** Chemin réel de POST /auth/login/client : LocalStrategy puis contrôleur. */
  const loginClient = async (password: string) => {
    const user = await authService.validateUser(email, password);
    return controller.loginClient({ user }, { email, password } as any);
  };

  const setup = async (initialRows: any[]) => {
    rows = initialRows;
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [AuthController],
      providers: [
        AuthService,
        UsersService,
        { provide: PrismaService, useValue: createInMemoryPrisma(rows) },
        { provide: MailService, useValue: { sendOwnerWelcomeEmail: jest.fn().mockResolvedValue(undefined) } },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('signed-token') } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key: string, fallback?: any) => fallback ?? 'test-secret') },
        },
      ],
    }).compile();
    authService = module.get(AuthService);
    controller = module.get(AuthController);
  };

  it('ancien CLIENT supprimé → réinscription client → rôle CLIENT', async () => {
    await setup([deletedUser({ role: 'CLIENT' })]);

    const result = await authService.register(clientRegistration);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'old-1', role: 'CLIENT', deletedAt: null, isActive: true });
    expect(result.user.role).toBe('CLIENT');
  });

  it('ancien PROPRIETAIRE supprimé → réinscription client → rôle CLIENT, champs propriétaire nettoyés', async () => {
    await setup([deletedOwner()]);

    await authService.register(clientRegistration);

    const [row] = rows;
    expect(rows).toHaveLength(1);
    expect(row.id).toBe('old-1'); // historique conservé : même ligne
    expect(row).toMatchObject({
      role: 'CLIENT',
      typeProprietaire: null,
      contractAcceptedAt: null,
      contractVersion: null,
      // Informations personnelles : celles de la nouvelle inscription
      email,
      firstName: 'Awa',
      lastName: 'Koné',
      phone: '0700000001',
      // Réactivation inchangée
      deletedAt: null,
      isActive: true,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    });
    expect(row.password).not.toBe(newPassword);
    expect(row.password).toMatch(/^\$2[aby]\$/);
  });

  it('le client réactivé (ancien propriétaire) peut utiliser login/client, plus login/proprio', async () => {
    await setup([deletedOwner()]);
    await authService.register(clientRegistration);

    const res = await loginClient(newPassword);
    expect(res.access_token).toBe('signed-token');
    expect(res.user.role).toBe('CLIENT');

    const user = await authService.validateUser(email, newPassword);
    await expect(controller.loginProprio({ user }, { email, password: newPassword } as any)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('inscription propriétaire → rôle PROPRIETAIRE (nouveau compte)', async () => {
    await setup([]);

    const result = await authService.registerProprietaire({ ...clientRegistration } as any);

    expect(rows[0]).toMatchObject({ role: 'PROPRIETAIRE', contractVersion: CURRENT_PARTNER_CONTRACT_VERSION });
    expect(rows[0].contractAcceptedAt).toBeInstanceOf(Date);
    expect(result.user.role).toBe('PROPRIETAIRE');
  });

  it('inscription propriétaire sur un ancien CLIENT supprimé → rôle PROPRIETAIRE, contrat enregistré', async () => {
    await setup([deletedUser({ role: 'CLIENT' })]);

    await authService.registerProprietaire({ ...clientRegistration } as any);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'old-1',
      role: 'PROPRIETAIRE',
      contractVersion: CURRENT_PARTNER_CONTRACT_VERSION,
      deletedAt: null,
    });
    expect(rows[0].contractAcceptedAt).toBeInstanceOf(Date);
  });
});
