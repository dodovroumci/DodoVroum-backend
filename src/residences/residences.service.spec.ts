import { ResidencesService } from './residences.service';
import { PaginationService } from '../common/services/pagination.service';

/**
 * `nombrePieces` doit traverser tout le flux : écriture Prisma à la création et
 * à la modification, puis exposition dans GET /residences et GET /residences/:id.
 * Les anciennes résidences (colonne NULL) doivent exposer `nombrePieces: null`
 * sans toucher à bedrooms / bathrooms / capacity.
 */
describe('ResidencesService — nombrePieces', () => {
  let service: ResidencesService;
  let prisma: any;
  let cacheService: any;

  const buildResidence = (overrides: Record<string, any> = {}) => ({
    id: 'res-1',
    title: 'Villa Cocody',
    address: '1 rue test',
    city: 'Abidjan',
    country: "Côte d'Ivoire",
    pricePerDay: 50000,
    capacity: 4,
    bedrooms: 2,
    bathrooms: 1,
    nombrePieces: 4,
    images: '[]',
    amenities: '[]',
    ownerId: 'owner-1',
    reviews: [],
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      residence: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      booking: { findFirst: jest.fn().mockResolvedValue(null) },
      blockedDate: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    cacheService = { invalidateResidencesCache: jest.fn() };
    const logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };
    service = new ResidencesService(prisma, new PaginationService(), cacheService, logger as any);
  });

  it('enregistre nombrePieces à la création, sans altérer bedrooms/bathrooms/capacity', async () => {
    prisma.residence.create.mockResolvedValue(buildResidence());

    await service.create(
      {
        title: 'Villa Cocody',
        address: '1 rue test',
        city: 'Abidjan',
        pricePerDay: 50000,
        capacity: 4,
        bedrooms: 2,
        bathrooms: 1,
        nombrePieces: 4,
      } as any,
      'owner-1',
    );

    const { data } = prisma.residence.create.mock.calls[0][0];
    expect(data).toMatchObject({ nombrePieces: 4, bedrooms: 2, bathrooms: 1, capacity: 4, ownerId: 'owner-1' });
  });

  it('conserve le mapping des alias français existants à côté de nombrePieces', async () => {
    prisma.residence.create.mockResolvedValue(buildResidence());

    await service.create(
      { nom: 'Villa', nombreChambres: 3, nombreSallesBain: 2, capacite: 6, nombrePieces: 5 } as any,
      'owner-1',
    );

    const { data } = prisma.residence.create.mock.calls[0][0];
    expect(data).toMatchObject({ title: 'Villa', bedrooms: 3, bathrooms: 2, capacity: 6, nombrePieces: 5 });
    expect(data).not.toHaveProperty('nombreChambres');
  });

  it('enregistre nombrePieces seul à la modification', async () => {
    prisma.residence.update.mockResolvedValue(buildResidence({ nombrePieces: 6 }));

    await service.update('res-1', { nombrePieces: 6 } as any);

    expect(prisma.residence.update).toHaveBeenCalledWith({ where: { id: 'res-1' }, data: { nombrePieces: 6 } });
  });

  it('expose nombrePieces dans findAll (valeur renseignée et null pour les anciennes résidences)', async () => {
    prisma.residence.findMany.mockResolvedValue([
      buildResidence(),
      buildResidence({ id: 'res-old', nombrePieces: null }),
    ]);
    prisma.residence.count.mockResolvedValue(2);

    const { data } = await service.findAll();

    expect(data[0]).toMatchObject({ id: 'res-1', nombrePieces: 4, bedrooms: 2, bathrooms: 1, capacity: 4 });
    expect(data[1]).toHaveProperty('nombrePieces', null);
  });

  it('expose nombrePieces dans findOne', async () => {
    prisma.residence.findUnique.mockResolvedValue(buildResidence({ owner: null }));

    const res = await service.findOne('res-1');

    expect(res).toMatchObject({ nombrePieces: 4, bedrooms: 2, bathrooms: 1, capacity: 4 });
  });

  it('expose nombrePieces: null dans findOne pour une ancienne résidence', async () => {
    prisma.residence.findUnique.mockResolvedValue(buildResidence({ owner: null, nombrePieces: null }));

    const res = await service.findOne('res-1');

    expect(res).toHaveProperty('nombrePieces', null);
  });
});
