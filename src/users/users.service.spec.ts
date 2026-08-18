import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService.create — réactivation des comptes soft-deleted', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      $raw: {
        user: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      },
      user: {
        create: jest.fn(),
      },
    };
    service = new UsersService(prisma);
  });

  const dto = {
    email: 'owner@example.com',
    password: 'MotDePasse123',
    firstName: 'Kouassi',
    lastName: 'Yao',
  } as any;

  it("crée normalement un utilisateur quand l'email n'existe pas du tout", async () => {
    prisma.$raw.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'new-1', email: dto.email });

    await service.create(dto);

    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.$raw.user.update).not.toHaveBeenCalled();
  });

  it('rejette avec 409 si un compte ACTIF existe déjà sur cet email', async () => {
    prisma.$raw.user.findUnique.mockResolvedValue({ id: 'active-1', deletedAt: null });

    await expect(service.create(dto)).rejects.toThrow(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.$raw.user.update).not.toHaveBeenCalled();
  });

  it('réactive (ne recrée pas) un compte précédemment supprimé sur cet email', async () => {
    prisma.$raw.user.findUnique.mockResolvedValue({ id: 'deleted-1', deletedAt: new Date('2026-01-01') });
    prisma.$raw.user.update.mockResolvedValue({ id: 'deleted-1', email: dto.email });

    await service.create(dto);

    expect(prisma.$raw.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deleted-1' },
        data: expect.objectContaining({
          deletedAt: null,
          isActive: true,
          refreshTokenHash: null,
        }),
      }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
