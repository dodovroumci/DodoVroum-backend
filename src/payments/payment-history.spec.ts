import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  BookingStatus,
  PaymentMethod,
  PaymentOption,
  PaymentStatus,
  RefundReason,
} from '@prisma/client';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { BookingsService } from '../bookings/bookings.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  buildPaymentHistory,
  classifyPayment,
  computeRemainingBalance,
  PaymentHistoryLogger,
  PaymentHistoryRow,
  paymentHistorySelect,
  paymentHistoryWhere,
  REMAINING_BALANCE_STATUSES,
} from './payment-history.mapper';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

// ---------------------------------------------------------------------------
// Fabriques de données (forme exacte de paymentHistorySelect)
// ---------------------------------------------------------------------------

const CLIENT = 'user-client';
const OTHER = 'user-other';

/** Paiement lu en base, sans sa réservation. */
type PaymentRow = Omit<PaymentHistoryRow, 'booking'>;
/** Réservation et ses paiements : forme de saisie des tests, aplatie par toRows. */
type BookingFixture = PaymentHistoryRow['booking'] & { payments: PaymentRow[] };

/** Une ligne par paiement, chacune portant sa réservation (forme renvoyée par Prisma). */
function toRows(bookings: BookingFixture[]): PaymentHistoryRow[] {
  return bookings.flatMap(({ payments, ...bookingRow }) =>
    payments.map((p) => ({ ...p, booking: bookingRow })),
  );
}

const buildHistory = (
  bookings: BookingFixture[],
  userId: string = CLIENT,
  logger?: PaymentHistoryLogger,
) => buildPaymentHistory(toRows(bookings), userId, logger);

let seq = 0;
function payment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  seq += 1;
  return {
    id: `pay-${seq}`,
    userId: CLIENT,
    amount: 50000,
    currency: 'XOF',
    status: PaymentStatus.COMPLETED,
    method: PaymentMethod.MOBILE_MONEY,
    paymentOption: PaymentOption.FULL_PAYMENT,
    transactionId: `GP-${seq}`,
    createdAt: new Date(
      `2026-10-01T10:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    ),
    paidAt: new Date('2026-10-01T10:05:00.000Z'),
    refundRequiredAt: null,
    refundReason: null,
    ...overrides,
  };
}

function booking(overrides: Partial<BookingFixture> = {}): BookingFixture {
  seq += 1;
  return {
    id: `book-${seq}`,
    userId: CLIENT,
    status: BookingStatus.PAID,
    totalPrice: 50000,
    startDate: new Date('2026-11-01T00:00:00.000Z'),
    endDate: new Date('2026-11-03T00:00:00.000Z'),
    createdAt: new Date('2026-10-01T09:00:00.000Z'),
    deletedAt: null,
    residence: { id: 'r1', title: 'Villa Cocody', images: ['/uploads/r1.jpg'] },
    vehicle: null,
    offer: null,
    payments: [],
    ...overrides,
  } as BookingFixture;
}

const single = (row: BookingFixture) => buildHistory([row], CLIENT).bookings[0];

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

describe('payment-history.mapper', () => {
  describe('classifyPayment', () => {
    it.each([
      [PaymentStatus.COMPLETED, null, 'COLLECTED'],
      [PaymentStatus.COMPLETED, new Date(), 'REFUND_DUE'],
      [PaymentStatus.REFUNDED, null, 'REFUNDED'],
      [PaymentStatus.REFUNDED, new Date(), 'REFUNDED'],
      [PaymentStatus.PENDING, null, 'PENDING'],
      [PaymentStatus.FAILED, null, 'NOT_COMPLETED'],
    ])(
      '%s / refundRequiredAt=%s → %s',
      (status, refundRequiredAt, expected) => {
        expect(classifyPayment({ status, refundRequiredAt })).toBe(expected);
      },
    );

    it('refundRequiredAt seul ne produit jamais REFUNDED', () => {
      for (const status of [
        PaymentStatus.COMPLETED,
        PaymentStatus.PENDING,
        PaymentStatus.FAILED,
      ]) {
        expect(
          classifyPayment({ status, refundRequiredAt: new Date() }),
        ).not.toBe('REFUNDED');
      }
    });
  });

  describe('champs d’un paiement', () => {
    it('method et paidAt null tant que rien n’est encaissé', () => {
      const b = single(
        booking({
          status: BookingStatus.AWAITING_PAYMENT,
          payments: [
            payment({ status: PaymentStatus.COMPLETED }),
            payment({
              status: PaymentStatus.PENDING,
              method: PaymentMethod.CARD,
              paidAt: null,
            }),
            payment({
              status: PaymentStatus.FAILED,
              method: PaymentMethod.CARD,
              paidAt: new Date(),
            }),
          ],
        }),
      );
      for (const p of b.payments.filter(
        (x) => x.state === 'PENDING' || x.state === 'NOT_COMPLETED',
      )) {
        expect(p.method).toBeNull();
        expect(p.paidAt).toBeNull();
      }
      const collected = b.payments.find((p) => p.state === 'COLLECTED');
      expect(collected.method).toBe(PaymentMethod.MOBILE_MONEY);
      expect(collected.paidAt).toBe('2026-10-01T10:05:00.000Z');
    });

    it('refundRequiredAt et refundReason exposés tels quels', () => {
      const at = new Date('2026-10-02T08:00:00.000Z');
      const b = single(
        booking({
          status: BookingStatus.EXPIRED,
          payments: [
            payment({
              refundRequiredAt: at,
              refundReason: RefundReason.BOOKING_EXPIRED,
            }),
          ],
        }),
      );
      expect(b.payments[0]).toMatchObject({
        state: 'REFUND_DUE',
        refundRequiredAt: at.toISOString(),
        refundReason: RefundReason.BOOKING_EXPIRED,
      });
    });
  });

  describe('devises', () => {
    it('devise réelle conservée (EUR reste EUR, aucune conversion)', () => {
      const b = single(
        booking({ payments: [payment({ currency: 'EUR', amount: 80 })] }),
      );
      expect(b.payments[0].currency).toBe('EUR');
      expect(b.payments[0].amount).toBe(80);
      expect(b.amounts).toEqual([
        { currency: 'EUR', collected: 80, refundDue: 0, refunded: 0 },
      ]);
    });

    it('réservations en XOF et en EUR : deux totaux distincts, jamais additionnés', () => {
      const history = buildHistory(
        [
          booking({ payments: [payment({ amount: 50000 })] }),
          booking({ payments: [payment({ currency: 'EUR', amount: 80 })] }),
        ],
        CLIENT,
      );
      expect(history.totals).toEqual(
        expect.arrayContaining([
          { currency: 'XOF', collected: 50000, refundDue: 0, refunded: 0 },
          { currency: 'EUR', collected: 80, refundDue: 0, refunded: 0 },
        ]),
      );
      expect(history.totals).toHaveLength(2);
    });

    it('même réservation, XOF encaissé + EUR à rembourser : deux entrées, solde calculé sur le XOF encaissé', () => {
      const b = single(
        booking({
          status: BookingStatus.PAID,
          totalPrice: 100000,
          payments: [
            payment({ amount: 30000 }),
            payment({
              currency: 'EUR',
              amount: 45,
              refundRequiredAt: new Date(),
              refundReason: RefundReason.DOUBLE_PAYMENT,
            }),
          ],
        }),
      );
      expect(b.amounts).toHaveLength(2);
      expect(b.remainingBalance).toBe(70000); // seul l'encaissé (XOF) compte pour le solde
    });

    it('même réservation, XOF et EUR tous deux encaissés : deux entrées, solde non calculé (null)', () => {
      const mixed = single(
        booking({
          status: BookingStatus.PAID,
          totalPrice: 100000,
          payments: [
            payment({ amount: 30000 }),
            payment({ currency: 'EUR', amount: 45 }),
          ],
        }),
      );
      expect(mixed.amounts).toHaveLength(2);
      expect(mixed.remainingBalance).toBeNull();
    });

    it('devise vide conservée et signalée', () => {
      const warn = jest.fn();
      const history = buildHistory(
        [booking({ payments: [payment({ currency: '' })] })],
        CLIENT,
        { warn },
      );
      expect(history.bookings[0].payments[0].currency).toBe('');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('devise vide'));
    });
  });

  describe('remainingBalance', () => {
    const withCollected = (
      status: BookingStatus,
      totalPrice = 100000,
      collected = 30000,
    ) =>
      single(
        booking({
          status,
          totalPrice,
          payments: [payment({ amount: collected })],
        }),
      ).remainingBalance;

    it('liste autorisée = exactement AWAITING_PAYMENT, PENDING, PAID, CONFIRMED, CONFIRMEE', () => {
      expect([...REMAINING_BALANCE_STATUSES].sort()).toEqual(
        [
          'AWAITING_PAYMENT',
          'CONFIRMED',
          'CONFIRMEE',
          'PAID',
          'PENDING',
        ].sort(),
      );
    });

    it.each([
      BookingStatus.AWAITING_PAYMENT,
      BookingStatus.PENDING,
      BookingStatus.PAID,
      BookingStatus.CONFIRMED,
      BookingStatus.CONFIRMEE,
    ])('%s : calculé (acompte 30 000 sur 100 000 → 70 000)', (status) => {
      expect(withCollected(status)).toBe(70000);
    });

    it.each([
      BookingStatus.ONGOING,
      BookingStatus.EN_COURS_SEJOUR,
      BookingStatus.CHECKIN_CLIENT,
      BookingStatus.CHECKIN_PROPRIO,
      BookingStatus.COMPLETED,
      BookingStatus.TERMINEE,
      BookingStatus.CANCELLED,
      BookingStatus.EXPIRED,
    ])('%s : null', (status) => {
      expect(withCollected(status)).toBeNull();
    });

    it('toutes les valeurs de BookingStatus : null si et seulement si hors liste autorisée', () => {
      const values = Object.values(BookingStatus);
      expect(values).toHaveLength(13); // un nouveau statut doit faire revoir cette règle
      for (const status of values) {
        expect({ status, isNull: withCollected(status) === null }).toEqual({
          status,
          isNull: !REMAINING_BALANCE_STATUSES.has(status),
        });
      }
    });

    it('statut inconnu : null', () => {
      expect(
        computeRemainingBalance('NOUVEAU_STATUT' as BookingStatus, 100000, []),
      ).toBeNull();
    });

    it('paiement complet confirmé : 0', () => {
      expect(withCollected(BookingStatus.CONFIRMED, 50000, 50000)).toBe(0);
    });

    it('encaissé > prix : 0, jamais négatif', () => {
      expect(withCollected(BookingStatus.PAID, 50000, 60000)).toBe(0);
    });

    it('annulée avec paiement encaissé (refus propriétaire) : null malgré collected > 0', () => {
      const b = single(
        booking({
          status: BookingStatus.CANCELLED,
          payments: [payment({ amount: 50000 })],
        }),
      );
      expect(b.amounts[0].collected).toBe(50000);
      expect(b.remainingBalance).toBeNull();
    });

    it('expirée avec remboursement dû : null', () => {
      const b = single(
        booking({
          status: BookingStatus.EXPIRED,
          payments: [
            payment({
              refundRequiredAt: new Date(),
              refundReason: RefundReason.BOOKING_EXPIRED,
            }),
          ],
        }),
      );
      expect(b.remainingBalance).toBeNull();
    });

    it('REFUND_DUE / REFUNDED ne réduisent pas le solde', () => {
      const b = single(
        booking({
          status: BookingStatus.PAID,
          totalPrice: 100000,
          payments: [
            payment({ amount: 30000 }),
            payment({
              amount: 30000,
              refundRequiredAt: new Date(),
              refundReason: RefundReason.DOUBLE_PAYMENT,
            }),
            payment({ amount: 30000, status: PaymentStatus.REFUNDED }),
          ],
        }),
      );
      expect(b.remainingBalance).toBe(70000);
    });

    it.each([
      BookingStatus.AWAITING_PAYMENT,
      BookingStatus.PENDING,
      BookingStatus.PAID,
      BookingStatus.CONFIRMED,
      BookingStatus.CONFIRMEE,
    ])(
      '%s, uniquement des paiements à rembourser ou remboursés : solde = totalPrice',
      (status) => {
        const b = single(
          booking({
            status,
            totalPrice: 100000,
            payments: [
              payment({
                amount: 40000,
                refundRequiredAt: new Date(),
                refundReason: RefundReason.DOUBLE_PAYMENT,
              }),
              payment({ amount: 20000, status: PaymentStatus.REFUNDED }),
              payment({
                currency: 'EUR',
                amount: 45,
                refundRequiredAt: new Date(),
                refundReason: RefundReason.DOUBLE_PAYMENT,
              }),
            ],
          }),
        );
        expect(b.amounts.every((a) => a.collected === 0)).toBe(true);
        expect(b.remainingBalance).toBe(100000);
      },
    );

    it('paiement encaissé avec devise vide : solde non calculé (null) et signalé', () => {
      const warn = jest.fn();
      const history = buildHistory(
        [
          booking({
            id: 'blank-currency',
            status: BookingStatus.PAID,
            totalPrice: 100000,
            payments: [payment({ currency: '', amount: 30000 })],
          }),
        ],
        CLIENT,
        { warn },
      );
      const b = history.bookings[0];
      expect(b.amounts).toEqual([
        { currency: '', collected: 30000, refundDue: 0, refunded: 0 },
      ]);
      expect(b.remainingBalance).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('solde non calculé pour blank-currency'),
      );
    });
  });

  describe('plusieurs paiements par réservation', () => {
    it('sessions remplacées puis paiement : un seul montant encaissé', () => {
      const b = single(
        booking({
          payments: [
            payment({ status: PaymentStatus.FAILED, paidAt: null }),
            payment({ status: PaymentStatus.FAILED, paidAt: null }),
            payment({ amount: 50000 }),
          ],
        }),
      );
      expect(b.payments).toHaveLength(3);
      expect(b.amounts).toEqual([
        { currency: 'XOF', collected: 50000, refundDue: 0, refunded: 0 },
      ]);
    });

    it('double paiement : COLLECTED + REFUND_DUE (DOUBLE_PAYMENT), montants séparés', () => {
      const b = single(
        booking({
          payments: [
            payment({ amount: 50000 }),
            payment({
              amount: 50000,
              refundRequiredAt: new Date(),
              refundReason: RefundReason.DOUBLE_PAYMENT,
            }),
          ],
        }),
      );
      expect(b.payments.map((p) => p.state).sort()).toEqual([
        'COLLECTED',
        'REFUND_DUE',
      ]);
      expect(b.amounts).toEqual([
        { currency: 'XOF', collected: 50000, refundDue: 50000, refunded: 0 },
      ]);
    });

    it.each([
      [BookingStatus.EXPIRED, RefundReason.BOOKING_EXPIRED],
      [BookingStatus.CANCELLED, RefundReason.BOOKING_CANCELLED],
    ])(
      'paiement reçu sur réservation %s : listée, collected 0, refundDue > 0',
      (status, reason) => {
        const history = buildHistory(
          [
            booking({
              status,
              payments: [
                payment({
                  amount: 25000,
                  refundRequiredAt: new Date(),
                  refundReason: reason,
                }),
              ],
            }),
          ],
          CLIENT,
        );
        expect(history.bookings).toHaveLength(1);
        expect(history.bookings[0].amounts).toEqual([
          { currency: 'XOF', collected: 0, refundDue: 25000, refunded: 0 },
        ]);
      },
    );

    it('remboursement effectué : listée, refunded > 0, hors total dépensé', () => {
      const history = buildHistory(
        [
          booking({
            status: BookingStatus.CANCELLED,
            payments: [
              payment({ amount: 40000, status: PaymentStatus.REFUNDED }),
            ],
          }),
        ],
        CLIENT,
      );
      expect(history.bookings).toHaveLength(1);
      expect(history.totals).toEqual([
        { currency: 'XOF', collected: 0, refundDue: 0, refunded: 40000 },
      ]);
    });

    it('seulement PENDING / NOT_COMPLETED : réservation exclue', () => {
      const history = buildHistory(
        [
          booking({
            status: BookingStatus.AWAITING_PAYMENT,
            payments: [
              payment({ status: PaymentStatus.PENDING, paidAt: null }),
              payment({ status: PaymentStatus.FAILED, paidAt: null }),
            ],
          }),
          booking({ status: BookingStatus.EXPIRED, payments: [] }),
        ],
        CLIENT,
      );
      expect(history.bookings).toEqual([]);
      expect(history.totals).toEqual([]);
    });
  });

  describe('totaux, tri, présentation', () => {
    it('total dépensé = Σ COLLECTED ; dû et remboursé séparés', () => {
      const history = buildHistory(
        [
          booking({ payments: [payment({ amount: 50000 })] }),
          booking({
            status: BookingStatus.EN_COURS_SEJOUR,
            payments: [payment({ amount: 60000 })],
          }),
          booking({
            status: BookingStatus.COMPLETED,
            payments: [payment({ amount: 70000 })],
          }),
          booking({
            status: BookingStatus.EXPIRED,
            payments: [
              payment({
                amount: 25000,
                refundRequiredAt: new Date(),
                refundReason: RefundReason.BOOKING_EXPIRED,
              }),
            ],
          }),
          booking({
            status: BookingStatus.CANCELLED,
            payments: [
              payment({ amount: 40000, status: PaymentStatus.REFUNDED }),
            ],
          }),
        ],
        CLIENT,
      );
      expect(history.totals).toEqual([
        {
          currency: 'XOF',
          collected: 180000,
          refundDue: 25000,
          refunded: 40000,
        },
      ]);
      const sum = (k: 'collected' | 'refundDue' | 'refunded') =>
        history.bookings
          .flatMap((b) => b.amounts)
          .reduce((s, a) => s + a[k], 0);
      expect(sum('collected')).toBe(180000);
      expect(sum('refundDue')).toBe(25000);
      expect(sum('refunded')).toBe(40000);
    });

    it('tri : dernière activité monétaire d’abord ; paiements du plus récent au plus ancien', () => {
      const old = booking({
        id: 'old',
        payments: [payment({ paidAt: new Date('2026-09-01T00:00:00Z') })],
      });
      const recent = booking({
        id: 'recent',
        payments: [payment({ paidAt: new Date('2026-10-20T00:00:00Z') })],
      });
      const history = buildHistory([old, recent], CLIENT);
      expect(history.bookings.map((b) => b.bookingId)).toEqual([
        'recent',
        'old',
      ]);

      const b = single(
        booking({
          payments: [
            payment({
              id: 'p-old',
              createdAt: new Date('2026-10-01T00:00:00Z'),
              status: PaymentStatus.FAILED,
            }),
            payment({
              id: 'p-new',
              createdAt: new Date('2026-10-02T00:00:00Z'),
            }),
          ],
        }),
      );
      expect(b.payments.map((p) => p.id)).toEqual(['p-new', 'p-old']);
    });

    it('titre, type et image : résidence, véhicule, offre (offre prioritaire)', () => {
      const residence = single(booking({ payments: [payment()] }));
      expect(residence).toMatchObject({
        type: 'RESIDENCE',
        title: 'Villa Cocody',
        imageUrl: '/uploads/r1.jpg',
      });

      const vehicle = single(
        booking({
          residence: null,
          vehicle: {
            id: 'v1',
            brand: 'Toyota',
            model: 'RAV4',
            title: 'SUV',
            images: 'a.jpg,b.jpg',
          },
          payments: [payment()],
        }),
      );
      expect(vehicle).toMatchObject({
        type: 'VEHICLE',
        title: 'Toyota RAV4',
        imageUrl: 'a.jpg',
      });

      const offer = single(
        booking({
          offer: {
            id: 'o1',
            title: 'Pack Assinie',
            imageUrl: null,
            residence: { images: '["o.jpg"]' },
          },
          payments: [payment()],
        }),
      );
      expect(offer).toMatchObject({
        type: 'OFFER',
        title: 'Pack Assinie',
        imageUrl: 'o.jpg',
      });
    });

    it('helper d’image : tableau, JSON, liste à virgules, vide', () => {
      const img = (images: unknown) =>
        single(
          booking({
            residence: { id: 'r', title: 'R', images: images as any },
            payments: [payment()],
          }),
        ).imageUrl;
      expect(img(['x.jpg', 'y.jpg'])).toBe('x.jpg');
      expect(img('["j.jpg"]')).toBe('j.jpg');
      expect(img('c1.jpg, c2.jpg')).toBe('c1.jpg');
      expect(img('')).toBeNull();
      expect(img([])).toBeNull();
      expect(img(null)).toBeNull();
    });

    it('réservation supprimée conservée (deleted: true)', () => {
      const b = single(
        booking({ deletedAt: new Date(), payments: [payment()] }),
      );
      expect(b.deleted).toBe(true);
    });

    it('liste blanche des clés : aucun champ interne ni donnée tierce', () => {
      const history = buildHistory(
        [booking({ payments: [payment()] })],
        CLIENT,
      );
      expect(Object.keys(history).sort()).toEqual(['bookings', 'totals']);
      expect(Object.keys(history.bookings[0]).sort()).toEqual(
        [
          'amounts',
          'bookingId',
          'bookingStatus',
          'deleted',
          'endDate',
          'imageUrl',
          'payments',
          'remainingBalance',
          'startDate',
          'title',
          'totalPrice',
          'type',
        ].sort(),
      );
      expect(Object.keys(history.bookings[0].payments[0]).sort()).toEqual(
        [
          'amount',
          'createdAt',
          'currency',
          'id',
          'method',
          'paidAt',
          'paymentOption',
          'refundReason',
          'refundRequiredAt',
          'state',
          'transactionId',
        ].sort(),
      );
      const json = JSON.stringify(history);
      for (const forbidden of [
        'checkoutUrl',
        'webhookEventId',
        'checkoutRequestedAt',
        'userId',
        'ownerPhone',
        'clientPhone',
        'baseAmount',
        'fees',
      ]) {
        expect(json).not.toContain(forbidden);
      }
    });
  });

  describe('cohérence avec my-bookings (formatBookingResponse inchangé)', () => {
    const bookingsService = new BookingsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ) as any;

    it.each([
      ['paiement complet', [payment({ amount: 50000 })]],
      [
        'acompte',
        [payment({ amount: 30000, paymentOption: PaymentOption.DOWN_PAYMENT })],
      ],
      [
        'double paiement',
        [
          payment({ amount: 50000 }),
          payment({
            amount: 50000,
            refundRequiredAt: new Date(),
            refundReason: RefundReason.DOUBLE_PAYMENT,
          }),
        ],
      ],
      [
        'remboursé + encaissé',
        [
          payment({ amount: 20000, status: PaymentStatus.REFUNDED }),
          payment({ amount: 50000 }),
        ],
      ],
      [
        'sessions remplacées',
        [
          payment({ status: PaymentStatus.FAILED, amount: 50000 }),
          payment({ amount: 50000 }),
        ],
      ],
    ])('%s : collected === totalPaid', (_label, payments) => {
      const row = booking({ payments });
      const legacy = bookingsService.formatBookingResponse({
        ...row,
        user: null,
      });
      const b = single(row);
      expect(b.amounts[0].collected).toBe(legacy.totalPaid);
    });
  });
});

// ---------------------------------------------------------------------------
// Service (Prisma simulé, sans base)
// ---------------------------------------------------------------------------

describe('PaymentsService.getHistory', () => {
  const config = { get: () => 'https://geniuspay.test' };

  /**
   * Prisma simulé.
   * - payment.findMany applique honnêtement `where.userId` et
   *   `where.booking.userId` (ou rien si `leaky`, pour tester le mapper seul) ;
   * - booking.findMany reproduit l'extension de suppression logique
   *   (`deletedAt: null` forcé) : s'il était utilisé, les réservations
   *   supprimées disparaîtraient.
   */
  function fakePrisma(bookings: BookingFixture[], { leaky = false } = {}) {
    const calls: any[] = [];
    return {
      calls,
      booking: {
        findMany: jest.fn(async () =>
          bookings.filter((b) => b.deletedAt === null),
        ),
      },
      payment: {
        findMany: jest.fn(async (args: any) => {
          calls.push(args);
          const rows = toRows(bookings);
          if (leaky) return rows;
          return rows.filter(
            (r) =>
              r.userId === args.where.userId &&
              r.booking.userId === args.where.booking.userId,
          );
        }),
      },
    };
  }

  const historyFrom = (prisma: ReturnType<typeof fakePrisma>) =>
    new PaymentsService(prisma as any, config as any).getHistory(CLIENT);

  it('requête : payment.findMany, filtrée sur payment.userId ET booking.userId, select explicite', async () => {
    const prisma = fakePrisma([]);
    await historyFrom(prisma);

    expect(prisma.payment.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
    const args = prisma.calls[0];
    expect(args.where).toEqual({ userId: CLIENT, booking: { userId: CLIENT } });
    expect(args.where).toEqual(paymentHistoryWhere(CLIENT));
    expect(args.include).toBeUndefined();
    expect(args.select).toEqual(paymentHistorySelect);
    expect(args.select.checkoutUrl).toBeUndefined();
    expect(args.select.webhookEventId).toBeUndefined();
    expect(args.select.booking.select.user).toBeUndefined();
    expect(args.where.booking.deletedAt).toBeUndefined(); // réservations supprimées conservées
  });

  it('réservation supprimée conservée malgré l’extension de suppression logique', async () => {
    const prisma = fakePrisma([
      booking({
        id: 'deleted',
        deletedAt: new Date('2026-10-05T00:00:00.000Z'),
        status: BookingStatus.CANCELLED,
        payments: [
          payment({
            id: 'refund-due',
            amount: 25000,
            refundRequiredAt: new Date(),
            refundReason: RefundReason.BOOKING_CANCELLED,
          }),
        ],
      }),
    ]);
    const history = await historyFrom(prisma);

    expect(prisma.booking.findMany).not.toHaveBeenCalled();
    expect(history.bookings).toHaveLength(1);
    expect(history.bookings[0]).toMatchObject({
      bookingId: 'deleted',
      deleted: true,
      remainingBalance: null,
      amounts: [
        { currency: 'XOF', collected: 0, refundDue: 25000, refunded: 0 },
      ],
    });
    expect(history.totals).toEqual([
      { currency: 'XOF', collected: 0, refundDue: 25000, refunded: 0 },
    ]);
  });

  it('PrismaService : payment lit sans extension, booking passe par l’extension', () => {
    const service = new PrismaService();
    expect(service.payment).toBe(service.$raw.payment);
    expect(service.booking).not.toBe(service.$raw.booking);
  });

  it('plusieurs paiements d’une même réservation regroupés en une seule entrée', async () => {
    const shared = booking({
      id: 'grouped',
      payments: [
        payment({ id: 'p1', status: PaymentStatus.FAILED, paidAt: null }),
        payment({ id: 'p2', amount: 50000 }),
        payment({
          id: 'p3',
          amount: 50000,
          refundRequiredAt: new Date(),
          refundReason: RefundReason.DOUBLE_PAYMENT,
        }),
      ],
    });
    const history = await historyFrom(fakePrisma([shared]));

    expect(history.bookings).toHaveLength(1);
    expect(history.bookings[0].payments.map((p) => p.id).sort()).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
    expect(history.bookings[0].amounts).toEqual([
      { currency: 'XOF', collected: 50000, refundDue: 50000, refunded: 0 },
    ]);
  });

  describe('paiement d’un autre utilisateur rattaché à une réservation du client', () => {
    const foreignOnly = () =>
      booking({
        id: 'shared',
        status: BookingStatus.PAID,
        payments: [payment({ id: 'foreign', userId: OTHER, amount: 99000 })],
      });
    const mixed = () =>
      booking({
        id: 'shared-mixed',
        status: BookingStatus.PAID,
        totalPrice: 100000,
        payments: [
          payment({ id: 'mine', amount: 30000 }),
          payment({ id: 'foreign', userId: OTHER, amount: 99000 }),
        ],
      });

    it('requête : le paiement étranger n’est pas lu et ne rend pas la réservation listable', async () => {
      const history = await historyFrom(fakePrisma([foreignOnly(), mixed()]));

      expect(history.bookings.map((b) => b.bookingId)).toEqual([
        'shared-mixed',
      ]);
      const b = history.bookings[0];
      expect(b.payments.map((p) => p.id)).toEqual(['mine']);
      expect(b.amounts).toEqual([
        { currency: 'XOF', collected: 30000, refundDue: 0, refunded: 0 },
      ]);
      expect(b.remainingBalance).toBe(70000);
      expect(history.totals).toEqual([
        { currency: 'XOF', collected: 30000, refundDue: 0, refunded: 0 },
      ]);
      expect(JSON.stringify(history)).not.toContain('foreign');
    });

    it('défense en profondeur : même si la base renvoyait le paiement étranger, le mapper l’ignore', async () => {
      const history = await historyFrom(
        fakePrisma([foreignOnly(), mixed()], { leaky: true }),
      );

      expect(history.bookings.map((b) => b.bookingId)).toEqual([
        'shared-mixed',
      ]);
      expect(history.bookings[0].payments.map((p) => p.id)).toEqual(['mine']);
      expect(history.totals[0].collected).toBe(30000);
      expect(JSON.stringify(history)).not.toContain('foreign');
    });
  });

  it('les réservations d’un autre utilisateur ne sont jamais renvoyées', async () => {
    const theirs = () =>
      booking({
        id: 'theirs',
        userId: OTHER,
        payments: [payment({ userId: OTHER })],
      });
    const history = await historyFrom(
      fakePrisma([booking({ id: 'mine', payments: [payment()] }), theirs()]),
    );
    expect(history.bookings.map((b) => b.bookingId)).toEqual(['mine']);

    // Mapper seul : paiement du client rattaché à la réservation d'un autre.
    const foreignBooking = booking({
      id: 'theirs-with-my-payment',
      userId: OTHER,
      payments: [payment({ userId: CLIENT })],
    });
    const leaky = await historyFrom(
      fakePrisma([theirs(), foreignBooking], { leaky: true }),
    );
    expect(leaky.bookings).toEqual([]);
    expect(leaky.totals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Contrôleur (HTTP, sans base)
// ---------------------------------------------------------------------------

describe('PaymentsController — GET /payments/history', () => {
  const emptyHistory = { totals: [], bookings: [] };

  function serviceMock() {
    return {
      getHistory: jest.fn(async () => emptyHistory),
      findOne: jest.fn(async () => ({ via: 'findOne' })),
      findByUser: jest.fn(async () => []),
    };
  }

  /** Garde factice : authentifie avec l'utilisateur de l'en-tête x-test-user. */
  class FakeAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest();
      req.user = { id: req.headers['x-test-user'], role: 'CLIENT' };
      return true;
    }
  }

  async function createApp(
    service: ReturnType<typeof serviceMock>,
    guard?: CanActivate,
  ): Promise<INestApplication> {
    const builder = Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: service }, Reflector],
    });
    if (guard) builder.overrideGuard(JwtAuthGuard).useValue(guard);
    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    return app;
  }

  it('route protégée par JwtAuthGuard et non publique', () => {
    const guards = Reflect.getMetadata('__guards__', PaymentsController) ?? [];
    expect(guards).toContain(JwtAuthGuard);
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        PaymentsController.prototype.getHistory,
      ),
    ).toBeUndefined();
  });

  it('sans jeton : 401 (vraie garde JWT)', async () => {
    const service = serviceMock();
    const app = await createApp(service);
    try {
      const res = await request(app.getHttpServer()).get(
        '/api/payments/history',
      );
      expect(res.status).toBe(401);
      expect(service.getHistory).not.toHaveBeenCalled();

      const badFormat = await request(app.getHttpServer())
        .get('/api/payments/history')
        .set('Authorization', 'Basic abc');
      expect(badFormat.status).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('« history » n’est pas capturé par GET :id', async () => {
    const service = serviceMock();
    const app = await createApp(service, new FakeAuthGuard());
    try {
      const res = await request(app.getHttpServer())
        .get('/api/payments/history')
        .set('x-test-user', CLIENT);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(emptyHistory);
      expect(service.getHistory).toHaveBeenCalledTimes(1);
      expect(service.findOne).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('utilise uniquement l’utilisateur du jeton : aucun paramètre ne cible un autre client', async () => {
    const service = serviceMock();
    const app = await createApp(service, new FakeAuthGuard());
    try {
      await request(app.getHttpServer())
        .get(`/api/payments/history?userId=${OTHER}&user=${OTHER}`)
        .set('x-test-user', CLIENT);
      expect(service.getHistory).toHaveBeenCalledWith(CLIENT);
      expect(service.getHistory).not.toHaveBeenCalledWith(OTHER);
    } finally {
      await app.close();
    }
  });
});
