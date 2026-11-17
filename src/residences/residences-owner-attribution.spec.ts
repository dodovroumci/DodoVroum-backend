import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { ResidencesController } from './residences.controller';
import { ResidencesService } from './residences.service';
import { PaginationService } from '../common/services/pagination.service';
import { CreateResidenceDto } from './dto/create-residence.dto';
import { UpdateResidenceDto } from './dto/update-residence.dto';

/**
 * Attribution du propriétaire à la création d'une résidence (lot 1, C1) :
 *  - un PROPRIETAIRE ne choisit jamais le propriétaire : c'est toujours l'utilisateur connecté ;
 *  - un ADMIN peut désigner un utilisateur existant ayant le rôle PROPRIETAIRE, et lui seul.
 * Avant ce correctif, le service réappliquait proprietaireId pour tous les rôles.
 */
describe('Résidences — attribution du propriétaire', () => {
  let controller: ResidencesController;
  let service: ResidencesService;
  let prisma: any;

  const owner = { id: 'owner-1', role: 'PROPRIETAIRE' };
  const otherOwner = { id: 'owner-2', role: 'PROPRIETAIRE' };
  const admin = { id: 'admin-1', role: 'ADMIN' };
  const dto = (extra: Record<string, any> = {}) =>
    ({ title: 'Villa', city: 'Abidjan', pricePerDay: 50000, ...extra }) as CreateResidenceDto;
  const createdOwnerId = () => prisma.residence.create.mock.calls[0][0].data.ownerId;

  beforeEach(() => {
    prisma = {
      residence: { create: jest.fn().mockResolvedValue({ id: 'res-1' }), update: jest.fn().mockResolvedValue({ id: 'res-1' }) },
      user: { findUnique: jest.fn() },
    };
    const logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };
    service = new ResidencesService(prisma, new PaginationService(), { invalidateResidencesCache: jest.fn() } as any, logger as any);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    controller = new ResidencesController(service, prisma);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('PROPRIETAIRE', () => {
    it("ignore le proprietaireId d'un autre utilisateur : le propriétaire est l'utilisateur connecté", async () => {
      await controller.create(dto({ proprietaireId: otherOwner.id }), { user: owner });

      expect(createdOwnerId()).toBe(owner.id);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('accepte son propre proprietaireId (envoyé par le dashboard propriétaire)', async () => {
      await controller.create(dto({ proprietaireId: owner.id }), { user: owner });

      expect(createdOwnerId()).toBe(owner.id);
    });

    it('sans proprietaireId : le propriétaire est l\'utilisateur connecté', async () => {
      await controller.create(dto(), { user: owner });

      expect(createdOwnerId()).toBe(owner.id);
    });
  });

  describe('ADMIN', () => {
    it('attribue la résidence à un propriétaire existant ayant le rôle PROPRIETAIRE', async () => {
      prisma.user.findUnique.mockResolvedValue(otherOwner);

      await controller.create(dto({ proprietaireId: otherOwner.id }), { user: admin });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: otherOwner.id }, select: { id: true, role: true } });
      expect(createdOwnerId()).toBe(otherOwner.id);
    });

    it.each(['CLIENT', 'ADMIN'])('refuse un utilisateur cible de rôle %s (400, aucune création)', async (role) => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-x', role });

      await expect(controller.create(dto({ proprietaireId: 'user-x' }), { user: admin })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.residence.create).not.toHaveBeenCalled();
    });

    it('refuse un utilisateur inexistant (404, aucune création)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(controller.create(dto({ proprietaireId: 'ghost' }), { user: admin })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.residence.create).not.toHaveBeenCalled();
    });

    it("sans proprietaireId : comportement inchangé, l'admin connecté devient propriétaire", async () => {
      await controller.create(dto(), { user: admin });

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(createdOwnerId()).toBe(admin.id);
    });
  });

  describe('ResidencesService (défense en profondeur)', () => {
    it("create : proprietaireId et ownerId du corps sont écartés au profit de l'ownerId résolu", async () => {
      await service.create(dto({ proprietaireId: 'intrus', ownerId: 'intrus' }), owner.id);

      const { data } = prisma.residence.create.mock.calls[0][0];
      expect(data.ownerId).toBe(owner.id);
      expect(data).not.toHaveProperty('proprietaireId');
    });

    it('update : proprietaireId et ownerId ne sont jamais transmis à Prisma', async () => {
      await service.update('res-1', { title: 'Nouveau', proprietaireId: 'intrus', ownerId: 'intrus' } as any);

      expect(prisma.residence.update).toHaveBeenCalledWith({ where: { id: 'res-1' }, data: { title: 'Nouveau' } });
    });
  });

  describe('Contrat HTTP inchangé (ValidationPipe global)', () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
    const messages = async (body: object, metatype: any) => {
      try {
        await pipe.transform(body, { type: 'body', metatype });
        return [];
      } catch (e) {
        return (e as BadRequestException).getResponse()['message'] as string[];
      }
    };

    it('POST /residences rejette toujours ownerId', async () => {
      expect(await messages({ ownerId: 'x' }, CreateResidenceDto)).toContain('property ownerId should not exist');
    });

    it('PATCH /residences/:id rejette toujours proprietaireId et ownerId', async () => {
      const errors = await messages({ proprietaireId: 'x', ownerId: 'x' }, UpdateResidenceDto);
      expect(errors).toEqual(expect.arrayContaining(['property proprietaireId should not exist', 'property ownerId should not exist']));
    });
  });
});
