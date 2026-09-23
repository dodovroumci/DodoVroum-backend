import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuthService, PASSWORD_RESET_TTL_MINUTES } from './auth.service';
import { UsersService } from '../users/users.service';

/**
 * Faux Prisma (modèle User) : reproduit la sémantique utilisée par le flux de
 * réinitialisation — findUnique filtré sur deletedAt (extension soft-delete),
 * updateMany conditionnel atomique renvoyant `count`.
 */
class FakePrisma {
  users: any[] = [];

  private matches(row: any, where: any): boolean {
    return Object.entries(where).every(([key, cond]: [string, any]) => {
      const value = row[key];
      if (cond === null) return value === null || value === undefined;
      if (cond && typeof cond === 'object' && !(cond instanceof Date) && 'gt' in cond) {
        return value instanceof Date && value > cond.gt;
      }
      return value === cond;
    });
  }

  user = {
    findUnique: async ({ where }: any) => {
      const row = this.users.find((u) => this.matches(u, { ...where, deletedAt: null }));
      return row ? { ...row } : null;
    },
    findFirst: async ({ where }: any) => {
      const row = this.users.find((u) => this.matches(u, { ...where, deletedAt: null }));
      return row ? { ...row } : null;
    },
    update: async ({ where, data }: any) => {
      const row = this.users.find((u) => u.id === where.id);
      Object.assign(row, data);
      return { ...row };
    },
    updateMany: async ({ where, data }: any) => {
      const rows = this.users.filter((u) => this.matches(u, where));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    },
  };
}

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const TOKEN_URL = /^https:\/\/dodovroum\.com\/reset-password#token=([0-9a-f]{64})$/;

describe('Mot de passe oublié / réinitialisation', () => {
  let prisma: FakePrisma;
  let auth: AuthService;
  let mail: { sendPasswordResetEmail: jest.Mock; sendOwnerWelcomeEmail: jest.Mock };

  const seedUser = (overrides: Record<string, any> = {}) => {
    const user = {
      id: 'user-1',
      email: 'awa@test.ci',
      firstName: 'Awa',
      password: '$2b$12$ancienHashNonUtilise',
      isActive: true,
      deletedAt: null,
      resetPasswordToken: null,
      resetPasswordExpires: null,
      refreshTokenHash: 'a'.repeat(64),
      ...overrides,
    };
    prisma.users.push(user);
    return user;
  };

  /** Token en clair tel qu'il figure dans le dernier lien envoyé. */
  const lastEmailedToken = (): string => {
    const { resetUrl } = mail.sendPasswordResetEmail.mock.calls.at(-1)[0];
    return TOKEN_URL.exec(resetUrl)![1];
  };

  beforeEach(() => {
    prisma = new FakePrisma();
    mail = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendOwnerWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    };
    const config = {
      get: (key: string) =>
        ({ PASSWORD_RESET_URL: 'https://dodovroum.com/reset-password' })[key],
    };
    auth = new AuthService(new UsersService(prisma as any), {} as any, config as any, mail as any);
  });

  describe('demande (forgot-password)', () => {
    it('compte actif : email envoyé au bon destinataire avec un lien #token=', async () => {
      seedUser();
      await auth.requestPasswordReset('  AWA@test.ci ');

      expect(mail.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      const payload = mail.sendPasswordResetEmail.mock.calls[0][0];
      expect(payload).toMatchObject({ to: 'awa@test.ci', firstName: 'Awa', expiresInMinutes: 30 });
      expect(payload.resetUrl).toMatch(TOKEN_URL);
    });

    it('token de 32 octets, stocké uniquement sous forme de SHA-256', async () => {
      const user = seedUser();
      await auth.requestPasswordReset('awa@test.ci');

      const token = lastEmailedToken();
      expect(Buffer.from(token, 'hex')).toHaveLength(32);
      expect(user.resetPasswordToken).toBe(sha256(token));
      expect(user.resetPasswordToken).not.toContain(token);
    });

    it('expiration à 30 minutes', async () => {
      const user = seedUser();
      const before = Date.now();
      await auth.requestPasswordReset('awa@test.ci');
      const after = Date.now();

      const ttl = PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
      expect(PASSWORD_RESET_TTL_MINUTES).toBe(30);
      expect(user.resetPasswordExpires.getTime()).toBeGreaterThanOrEqual(before + ttl);
      expect(user.resetPasswordExpires.getTime()).toBeLessThanOrEqual(after + ttl);
    });

    it('email inexistant : aucun email, aucune écriture', async () => {
      const user = seedUser();
      await auth.requestPasswordReset('inconnu@test.ci');

      expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(user.resetPasswordToken).toBeNull();
    });

    it('compte désactivé : aucun email, aucun token', async () => {
      const user = seedUser({ isActive: false });
      await auth.requestPasswordReset('awa@test.ci');

      expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(user.resetPasswordToken).toBeNull();
    });

    it('compte supprimé (soft delete) : aucun email', async () => {
      seedUser({ deletedAt: new Date() });
      await auth.requestPasswordReset('awa@test.ci');
      expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('une nouvelle demande remplace l\'ancien token', async () => {
      const user = seedUser();
      await auth.requestPasswordReset('awa@test.ci');
      const first = lastEmailedToken();
      await auth.requestPasswordReset('awa@test.ci');
      const second = lastEmailedToken();

      expect(second).not.toBe(first);
      expect(user.resetPasswordToken).toBe(sha256(second));
      await expect(auth.resetPassword(first, 'nouveauMotDePasse')).resolves.toBe(false);
      await expect(auth.resetPassword(second, 'nouveauMotDePasse')).resolves.toBe(true);
    });
  });

  describe('réinitialisation (reset-password)', () => {
    const issueToken = async () => {
      await auth.requestPasswordReset('awa@test.ci');
      return lastEmailedToken();
    };

    it('token valide : mot de passe bcrypté, token supprimé, sessions invalidées', async () => {
      const user = seedUser();
      const token = await issueToken();

      await expect(auth.resetPassword(token, 'nouveauMotDePasse')).resolves.toBe(true);

      expect(await bcrypt.compare('nouveauMotDePasse', user.password)).toBe(true);
      expect(user.resetPasswordToken).toBeNull();
      expect(user.resetPasswordExpires).toBeNull();
      expect(user.refreshTokenHash).toBeNull();
    });

    it('token invalide : refus, rien ne change', async () => {
      const user = seedUser();
      await issueToken();
      const passwordBefore = user.password;

      await expect(auth.resetPassword('f'.repeat(64), 'nouveauMotDePasse')).resolves.toBe(false);
      expect(user.password).toBe(passwordBefore);
      expect(user.refreshTokenHash).not.toBeNull();
    });

    it('token expiré : refus', async () => {
      const user = seedUser();
      const token = await issueToken();
      user.resetPasswordExpires = new Date(Date.now() - 1000);

      await expect(auth.resetPassword(token, 'nouveauMotDePasse')).resolves.toBe(false);
      expect(await bcrypt.compare('nouveauMotDePasse', user.password)).toBe(false);
    });

    it('token déjà utilisé : refus', async () => {
      seedUser();
      const token = await issueToken();

      await expect(auth.resetPassword(token, 'premierMotDePasse')).resolves.toBe(true);
      await expect(auth.resetPassword(token, 'secondMotDePasse')).resolves.toBe(false);
    });

    it('même token utilisé simultanément : une seule requête réussit', async () => {
      const user = seedUser();
      const token = await issueToken();

      const results = await Promise.all([
        auth.resetPassword(token, 'motDePasseA123'),
        auth.resetPassword(token, 'motDePasseB123'),
        auth.resetPassword(token, 'motDePasseC123'),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      const winner = ['motDePasseA123', 'motDePasseB123', 'motDePasseC123'][results.indexOf(true)];
      expect(await bcrypt.compare(winner, user.password)).toBe(true);
    });

    it('mot de passe de moins de 8 caractères : refus, token conservé', async () => {
      const user = seedUser();
      const token = await issueToken();

      await expect(auth.resetPassword(token, 'court12')).resolves.toBe(false);
      expect(user.resetPasswordToken).toBe(sha256(token));
    });

    it('mot de passe commençant par $2 : toujours bcrypté', async () => {
      const user = seedUser();
      const token = await issueToken();
      const tricky = '$2b$12$pasUnHashMaisUnMotDePasse';

      await expect(auth.resetPassword(token, tricky)).resolves.toBe(true);

      expect(user.password).not.toBe(tricky);
      expect(await bcrypt.compare(tricky, user.password)).toBe(true);
    });

    it('compte désactivé après la demande : refus', async () => {
      const user = seedUser();
      const token = await issueToken();
      user.isActive = false;

      await expect(auth.resetPassword(token, 'nouveauMotDePasse')).resolves.toBe(false);
    });
  });
});
