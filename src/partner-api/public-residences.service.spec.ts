import {
  buildBlockingBookingWhere,
  residenceBookingScope,
} from '../bookings/booking-blocking.rule';
import { buildDateOverlapCondition } from '../common/utils/date-overlap.util';
import { PartnerResidencesQueryDto } from './dto/partner-api-query.dto';
import {
  ELIGIBLE_RESIDENCE_WHERE,
  PUBLIC_RESIDENCE_SELECT,
} from './public-residence.serializer';
import { PublicResidencesService } from './public-residences.service';

describe('PublicResidencesService (requêtes Prisma)', () => {
  const NOW = new Date('2026-11-17T10:00:00.000Z');
  const ID = 'clres000000000000000000001';
  const row = {
    id: ID,
    title: 'Villa',
    typeResidence: null,
    city: 'Assinie',
    country: "Côte d'Ivoire",
    pricePerDay: 45000,
    capacity: 6,
    bedrooms: 3,
    bathrooms: 2,
    nombrePieces: null,
    amenities: '[]',
    images: '[]',
  };

  let prisma: {
    residence: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    booking: { findFirst: jest.Mock };
    blockedDate: { findFirst: jest.Mock };
    review: { groupBy: jest.Mock };
  };
  let service: PublicResidencesService;

  beforeEach(() => {
    prisma = {
      residence: {
        findFirst: jest.fn().mockResolvedValue(row),
        findMany: jest.fn().mockResolvedValue([row]),
        count: jest.fn().mockResolvedValue(1),
      },
      booking: { findFirst: jest.fn().mockResolvedValue(null) },
      blockedDate: { findFirst: jest.fn().mockResolvedValue(null) },
      review: {
        groupBy: jest
          .fn()
          .mockResolvedValue([
            { residenceId: ID, _avg: { rating: 4.25 }, _count: { _all: 4 } },
          ]),
      },
    };
    service = new PublicResidencesService(prisma as never);
  });

  const allMocks = () => [
    prisma.residence.findFirst,
    prisma.residence.findMany,
    prisma.residence.count,
    prisma.booking.findFirst,
    prisma.blockedDate.findFirst,
    prisma.review.groupBy,
  ];

  describe('getResidence', () => {
    it('filtre d’éligibilité + liste blanche des colonnes, note agrégée sans texte', async () => {
      const detail = await service.getResidence(ID);

      expect(prisma.residence.findFirst).toHaveBeenCalledWith({
        where: { id: ID, ...ELIGIBLE_RESIDENCE_WHERE },
        select: PUBLIC_RESIDENCE_SELECT,
      });
      expect(prisma.review.groupBy).toHaveBeenCalledWith({
        by: ['residenceId'],
        where: { residenceId: { in: [ID] } },
        _avg: { rating: true },
        _count: { _all: true },
      });
      expect(detail.rating).toEqual({ average: 4.3, count: 4 });
    });

    it('non éligible ou inexistante → 404 RESIDENCE_NOT_FOUND', async () => {
      prisma.residence.findFirst.mockResolvedValue(null);
      await expect(service.getResidence(ID)).rejects.toMatchObject({
        code: 'RESIDENCE_NOT_FOUND',
        status: 404,
      });
      expect(prisma.review.groupBy).not.toHaveBeenCalled();
    });

    it.each(['', 'a'.repeat(65), "x' OR 1=1", '../etc', 'id%00'])(
      'identifiant mal formé (%p) → 404 sans requête',
      async (id) => {
        await expect(service.getResidence(id)).rejects.toMatchObject({
          code: 'RESIDENCE_NOT_FOUND',
        });
        for (const mock of allMocks()) expect(mock).not.toHaveBeenCalled();
      },
    );
  });

  describe('searchResidences', () => {
    const search = (query: PartnerResidencesQueryDto) =>
      service.searchResidences(query, NOW);

    it('sans filtre : éligibilité seule, tri récent stable, 20 par page', async () => {
      const result = await search({});
      const where = { AND: [ELIGIBLE_RESIDENCE_WHERE] };

      expect(prisma.residence.count).toHaveBeenCalledWith({ where });
      expect(prisma.residence.findMany).toHaveBeenCalledWith({
        where,
        select: PUBLIC_RESIDENCE_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: 0,
        take: 20,
      });
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
      expect(result.data[0].rating).toEqual({ average: 4.3, count: 4 });
    });

    it('filtres traduits sur les colonnes publiques uniquement (jamais l’adresse)', async () => {
      await search({
        city: 'Assinie',
        q: 'piscine',
        typeResidence: 'Villa',
        minPrice: 10000,
        maxPrice: 90000,
        guests: 4,
        bedrooms: 2,
        sort: 'price_asc',
        page: 3,
        limit: 10,
      });
      const args = prisma.residence.findMany.mock.calls[0][0];

      expect(args.where).toEqual({
        AND: [
          ELIGIBLE_RESIDENCE_WHERE,
          { city: 'Assinie' },
          {
            OR: [
              { title: { contains: 'piscine' } },
              { city: { contains: 'piscine' } },
            ],
          },
          { typeResidence: { contains: 'Villa' } },
          { pricePerDay: { gte: 10000 } },
          { pricePerDay: { lte: 90000 } },
          { capacity: { gte: 4 } },
          { bedrooms: { gte: 2 } },
        ],
      });
      expect(JSON.stringify(args.where)).not.toContain('address');
      expect(args.orderBy).toEqual([{ pricePerDay: 'asc' }, { id: 'asc' }]);
      expect(args.skip).toBe(20);
      expect(args.take).toBe(10);
    });

    it('avec dates : même règle que la réservation, exprimée sur les relations', async () => {
      await search({ checkIn: '2026-12-20', checkOut: '2026-12-23' });
      const start = new Date('2026-12-20T00:00:00.000Z');
      const end = new Date('2026-12-23T00:00:00.000Z');
      const blocking = {
        deletedAt: null,
        ...buildBlockingBookingWhere(start, end, NOW),
      };

      expect(prisma.residence.findMany.mock.calls[0][0].where.AND[1]).toEqual({
        bookings: { none: blocking },
        offers: { none: { bookings: { some: blocking } } },
        blockedDates: { none: buildDateOverlapCondition(start, end) },
      });
    });

    it.each([
      [{ checkIn: '2026-12-20' }, 'INVALID_PARAMETER'],
      [{ checkOut: '2026-12-20' }, 'INVALID_PARAMETER'],
      [{ minPrice: 5, maxPrice: 4 }, 'INVALID_PARAMETER'],
      [{ checkIn: '2026-11-16', checkOut: '2026-11-18' }, 'INVALID_DATE_RANGE'],
      [{ checkIn: '2026-12-01', checkOut: '2027-01-05' }, 'INVALID_DATE_RANGE'],
    ])('paramètres incohérents %p → %s sans requête', async (query, code) => {
      await expect(
        search(query as PartnerResidencesQueryDto),
      ).rejects.toMatchObject({ code, status: 400 });
      for (const mock of allMocks()) expect(mock).not.toHaveBeenCalled();
    });

    it('page vide : aucune requête d’avis', async () => {
      prisma.residence.findMany.mockResolvedValue([]);
      prisma.residence.count.mockResolvedValue(0);
      const result = await search({ page: 5 });
      expect(result).toEqual({
        data: [],
        pagination: { page: 5, limit: 20, total: 0, totalPages: 0 },
      });
      expect(prisma.review.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('getAvailability', () => {
    const start = new Date('2026-12-20T00:00:00.000Z');
    const end = new Date('2026-12-23T00:00:00.000Z');
    const availability = () =>
      service.getAvailability(ID, '2026-12-20', '2026-12-23', NOW);

    it('mêmes contrôles que la réservation : périmètre résidence + offres, règle de blocage, blocages manuels', async () => {
      await availability();

      expect(prisma.residence.findFirst).toHaveBeenCalledWith({
        where: { id: ID, ...ELIGIBLE_RESIDENCE_WHERE },
        select: { id: true, pricePerDay: true },
      });
      expect(prisma.booking.findFirst).toHaveBeenCalledWith({
        where: {
          ...residenceBookingScope(ID),
          ...buildBlockingBookingWhere(start, end, NOW),
        },
        select: { id: true },
      });
      expect(prisma.blockedDate.findFirst).toHaveBeenCalledWith({
        where: { residenceId: ID, ...buildDateOverlapCondition(start, end) },
        select: { id: true },
      });
    });

    it('libre : disponible, prix = prix par nuit × nuits', async () => {
      prisma.residence.findFirst.mockResolvedValue({
        id: ID,
        pricePerDay: 45000,
      });
      await expect(availability()).resolves.toEqual({
        residenceId: ID,
        checkIn: '2026-12-20',
        checkOut: '2026-12-23',
        available: true,
        nights: 3,
        pricePerNight: { amount: 45000, currency: 'XOF' },
        estimatedTotal: { amount: 135000, currency: 'XOF' },
        url: `https://dodovroum.com/r/${ID}`,
      });
    });

    it.each([
      ['réservation bloquante', 'booking'],
      ['blocage manuel', 'blockedDate'],
    ] as const)(
      '%s : indisponible, sans motif ni identifiant',
      async (_label, model) => {
        prisma[model].findFirst.mockResolvedValue({
          id: 'secret-id',
          reason: 'privé',
          bookingId: 'bk-1',
        });
        const result = await availability();
        expect(result.available).toBe(false);
        expect(JSON.stringify(result)).not.toMatch(
          /secret-id|privé|bk-1|reason|bookingId/,
        );
      },
    );

    it('résidence non éligible → 404, aucune lecture de réservation', async () => {
      prisma.residence.findFirst.mockResolvedValue(null);
      await expect(availability()).rejects.toMatchObject({
        code: 'RESIDENCE_NOT_FOUND',
      });
      expect(prisma.booking.findFirst).not.toHaveBeenCalled();
      expect(prisma.blockedDate.findFirst).not.toHaveBeenCalled();
    });

    it('dates invalides → 400 avant toute requête', async () => {
      await expect(
        service.getAvailability(ID, '2026-12-23', '2026-12-20', NOW),
      ).rejects.toMatchObject({
        code: 'INVALID_DATE_RANGE',
      });
      for (const mock of allMocks()) expect(mock).not.toHaveBeenCalled();
    });
  });
});
