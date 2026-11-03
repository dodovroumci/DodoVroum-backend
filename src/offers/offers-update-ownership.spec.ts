import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { OffersService } from './offers.service';
import { PaginationService } from '../common/services/pagination.service';
import { UpdateOfferDto } from './dto/update-offer.dto';

/**
 * Modification des biens d'une offre combinée (lot 1, C3) : la résidence ET le véhicule
 * doivent appartenir au propriétaire de l'offre existante, même si un seul identifiant change,
 * et quel que soit l'appelant (propriétaire ou admin : le service ne dépend pas du rôle).
 * Avant ce correctif, seule l'égalité résidence.ownerId === vehicle.ownerId était vérifiée :
 * le propriétaire A pouvait rattacher à son offre la résidence et le véhicule du propriétaire B.
 */
describe('OffersService.update — propriété des biens', () => {
  let service: OffersService;
  let prisma: any;

  const residences: Record<string, any> = {
    'res-a': { id: 'res-a', ownerId: 'owner-a', isActive: true },
    'res-a2': { id: 'res-a2', ownerId: 'owner-a', isActive: true },
    'res-b': { id: 'res-b', ownerId: 'owner-b', isActive: true },
  };
  const vehicles: Record<string, any> = {
    'veh-a': { id: 'veh-a', ownerId: 'owner-a', isActive: true },
    'veh-a2': { id: 'veh-a2', ownerId: 'owner-a', isActive: true },
    'veh-b': { id: 'veh-b', ownerId: 'owner-b', isActive: true },
  };
  const offerOf = (overrides: Record<string, any> = {}) => ({
    residenceId: 'res-a',
    vehicleId: 'veh-a',
    ownerId: 'owner-a',
    ...overrides,
  });
  const updatedRow = {
    id: 'offer-1',
    title: 'Pack',
    isActive: true,
    validFrom: new Date('2026-01-01'),
    validTo: new Date('2099-01-01'),
    residence: { id: 'res-a', images: '[]', amenities: '[]', reviews: [] },
    vehicle: { id: 'veh-a', images: '[]', features: '[]', reviews: [] },
  };

  beforeEach(() => {
    prisma = {
      offer: {
        findUnique: jest.fn().mockResolvedValue(offerOf()),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(updatedRow),
      },
      residence: { findUnique: jest.fn(({ where }) => Promise.resolve(residences[where.id] ?? null)) },
      vehicle: { findUnique: jest.fn(({ where }) => Promise.resolve(vehicles[where.id] ?? null)) },
    };
    service = new OffersService(prisma, new PaginationService(), {} as any, {} as any);
  });

  const expectRejected = async (dto: Record<string, any>) => {
    await expect(service.update('offer-1', dto as UpdateOfferDto)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.offer.update).not.toHaveBeenCalled();
  };

  it("refuse de remplacer les deux biens par ceux d'un autre propriétaire", async () => {
    await expectRejected({ residenceId: 'res-b', vehicleId: 'veh-b' });
  });

  it("refuse de remplacer seulement la résidence par celle d'un autre propriétaire", async () => {
    await expectRejected({ residenceId: 'res-b' });
  });

  it("refuse de remplacer seulement le véhicule par celui d'un autre propriétaire", async () => {
    await expectRejected({ vehicleId: 'veh-b' });
  });

  it("vérifie aussi le bien inchangé : refus si la résidence actuelle n'appartient pas au propriétaire de l'offre", async () => {
    prisma.offer.findUnique.mockResolvedValue(offerOf({ residenceId: 'res-b' }));

    await expectRejected({ vehicleId: 'veh-a2' });
  });

  it('accepte de remplacer un bien par un autre bien du propriétaire de l\'offre', async () => {
    await service.update('offer-1', { vehicleId: 'veh-a2' } as UpdateOfferDto);

    expect(prisma.offer.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'offer-1' }, data: { vehicleId: 'veh-a2' } }));
  });

  it('accepte de remplacer les deux biens par d\'autres biens du propriétaire de l\'offre', async () => {
    await service.update('offer-1', { residenceId: 'res-a2', vehicleId: 'veh-a2' } as UpdateOfferDto);

    expect(prisma.offer.update).toHaveBeenCalledWith(expect.objectContaining({ data: { residenceId: 'res-a2', vehicleId: 'veh-a2' } }));
  });

  it('refuse toute modification des biens si l\'offre n\'a pas de propriétaire', async () => {
    prisma.offer.findUnique.mockResolvedValue(offerOf({ ownerId: null }));

    await expectRejected({ vehicleId: 'veh-a2' });
  });

  it('sans changement de bien : aucun contrôle de propriété, comportement inchangé', async () => {
    await service.update('offer-1', { title: 'Nouveau titre' } as UpdateOfferDto);

    expect(prisma.residence.findUnique).not.toHaveBeenCalled();
    expect(prisma.vehicle.findUnique).not.toHaveBeenCalled();
    expect(prisma.offer.update).toHaveBeenCalledWith(expect.objectContaining({ data: { title: 'Nouveau titre' } }));
  });

  it("ownerId n'est jamais transmis à Prisma, même s'il atteint le service", async () => {
    await service.update('offer-1', { title: 'Pack', ownerId: 'owner-b' } as any);

    expect(prisma.offer.update.mock.calls[0][0].data).toEqual({ title: 'Pack' });
  });

  it('offre inexistante : 404', async () => {
    prisma.offer.findUnique.mockResolvedValue(null);

    await expect(service.update('offer-x', { title: 'x' } as UpdateOfferDto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('PATCH /offers/:id rejette toujours ownerId (ValidationPipe global)', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

    await expect(pipe.transform({ ownerId: 'owner-b' }, { type: 'body', metatype: UpdateOfferDto })).rejects.toBeInstanceOf(BadRequestException);
  });
});
