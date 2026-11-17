import { BookingValidationService } from './services/booking-validation.service';
import {
  buildBlockingBookingWhere,
  residenceBookingScope,
} from './booking-blocking.rule';

/**
 * Non-régression : la règle de chevauchement utilisée à la création d'une réservation
 * (BookingValidationService.buildOverlapWhere) doit produire exactement ce filtre.
 * Toute lecture de disponibilité (API partenaire) doit partager cette même règle.
 */
describe('Règle de blocage des réservations (référence)', () => {
  const NOW = new Date('2026-11-17T10:00:00.000Z');
  const PENDING_SINCE = new Date('2026-11-17T09:45:00.000Z'); // NOW - 15 min

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const expectedWhere = (start: Date, end: Date) => ({
    AND: [
      {
        OR: [
          {
            status: {
              in: [
                'PAID',
                'CONFIRMED',
                'CONFIRMEE',
                'CHECKIN_CLIENT',
                'CHECKIN_PROPRIO',
                'EN_COURS_SEJOUR',
                'ONGOING',
              ],
            },
          },
          {
            AND: [
              { status: { in: ['PENDING', 'AWAITING_PAYMENT'] } },
              { createdAt: { gte: PENDING_SINCE } },
            ],
          },
        ],
      },
      {
        OR: [
          { AND: [{ startDate: { lte: start } }, { endDate: { gt: start } }] },
          { AND: [{ startDate: { lt: end } }, { endDate: { gte: end } }] },
          { AND: [{ startDate: { gte: start } }, { endDate: { lte: end } }] },
        ],
      },
    ],
  });

  const buildOverlapWhere = (...args: unknown[]) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (new BookingValidationService({} as any) as any).buildOverlapWhere(...args);

  it('statuts fermes toujours bloquants, PENDING/AWAITING_PAYMENT pendant 15 min, plage [début, fin[', () => {
    expect(buildOverlapWhere('2026-12-20', '2026-12-23')).toEqual(
      expectedWhere(new Date('2026-12-20'), new Date('2026-12-23')),
    );
  });

  it('la règle partagée (lectures de disponibilité) produit exactement le même filtre', () => {
    const start = new Date('2026-12-20');
    const end = new Date('2026-12-23');
    expect(buildBlockingBookingWhere(start, end, NOW)).toEqual(
      buildOverlapWhere('2026-12-20', '2026-12-23'),
    );
    expect(buildBlockingBookingWhere(start, end, NOW)).toEqual(
      expectedWhere(start, end),
    );
  });

  it('périmètre résidence : réservations directes et via une offre combinée', () => {
    expect(residenceBookingScope('res-1')).toEqual({
      OR: [{ residenceId: 'res-1' }, { offer: { residenceId: 'res-1' } }],
    });
  });

  it('création de réservation : le contrôle résidence utilise ce périmètre et cette règle', async () => {
    const prisma = {
      residence: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'res-1', isActive: true }),
      },
      booking: { findFirst: jest.fn().mockResolvedValue(null) },
      blockedDate: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new BookingValidationService(prisma as any) as any;
    await service.validateResidenceAvailability(
      'res-1',
      '2026-12-20',
      '2026-12-23',
    );

    expect(prisma.booking.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ residenceId: 'res-1' }, { offer: { residenceId: 'res-1' } }],
        ...expectedWhere(new Date('2026-12-20'), new Date('2026-12-23')),
      },
    });
  });

  it('exclusion d’une réservation (mise à jour) conservée', () => {
    expect(buildOverlapWhere('2026-12-20', '2026-12-23', 'bk-1')).toEqual({
      id: { not: 'bk-1' },
      ...expectedWhere(new Date('2026-12-20'), new Date('2026-12-23')),
    });
  });
});
