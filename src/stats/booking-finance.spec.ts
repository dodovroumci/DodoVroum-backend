import {
  bookingFinance,
  commissionOf,
  FinanceBooking,
  FinancePayment,
  summarizeFinance,
} from './booking-finance';

const paid = (amount: number, overrides: Partial<FinancePayment> = {}): FinancePayment => ({
  amount,
  status: 'COMPLETED',
  refundRequiredAt: null,
  ...overrides,
});

const booking = (overrides: Partial<FinanceBooking> = {}): FinanceBooking => ({
  totalPrice: 100000,
  status: 'PAID',
  ownerConfirmedAt: null,
  payments: [],
  ...overrides,
});

/** Confirmée par le propriétaire le 20 septembre, clés pas encore remises. */
const CONFIRMED = { status: 'CONFIRMED', ownerConfirmedAt: new Date('2026-09-20T10:00:00Z') };
/** Clés remises le 1er octobre (ownerConfirmedAt réécrit à la remise). */
const KEYS_HANDED = { status: 'EN_COURS_SEJOUR', ownerConfirmedAt: new Date('2026-10-01T10:00:00Z') };
const NOW = new Date('2026-10-15T12:00:00Z');

/** Ce que voient le propriétaire et DodoVroum pour une seule réservation. */
const view = (b: FinanceBooking, now = NOW) => {
  const s = summarizeFinance([b], now);
  return {
    ownerRealized: s.owner.realized,
    ownerPending: s.owner.pending,
    commission: s.platform.realized.commission,
    volume: s.platform.realized.bookingValue,
  };
};

describe('booking-finance — revenus DodoVroum', () => {
  describe('cas validés (100 000 FCFA)', () => {
    it('cas 1 — 100 % payé, non confirmé : propriétaire en attente, DodoVroum rien', () => {
      expect(view(booking({ payments: [paid(100000)] }))).toEqual({
        ownerRealized: 0,
        ownerPending: 90000,
        commission: 0,
        volume: 0,
      });
    });

    it('cas 3 — 30 % payé, non confirmé : propriétaire en attente, DodoVroum rien', () => {
      expect(view(booking({ payments: [paid(30000)] }))).toEqual({
        ownerRealized: 0,
        ownerPending: 90000,
        commission: 0,
        volume: 0,
      });
    });

    it('confirmée, clés pas encore remises : propriétaire 90 000 en attente, DodoVroum 10 000 / 100 000 comptés', () => {
      expect(view(booking({ ...CONFIRMED, payments: [paid(30000)] }))).toEqual({
        ownerRealized: 0,
        ownerPending: 90000,
        commission: 10000,
        volume: 100000,
      });
    });

    it.each([
      ['cas 2 — 100 % payé', 100000],
      ['cas 4 — 30 % payé', 30000],
    ])('%s, clés remises : propriétaire 90 000 réalisé, DodoVroum 10 000 / 100 000', (_label, amount) => {
      expect(view(booking({ ...KEYS_HANDED, payments: [paid(amount)] }))).toEqual({
        ownerRealized: 90000,
        ownerPending: 0,
        commission: 10000,
        volume: 100000,
      });
    });

    it('cas 5 — annulée avant confirmation (même payée) : ne compte nulle part', () => {
      expect(view(booking({ status: 'CANCELLED', payments: [paid(30000)] }))).toEqual({
        ownerRealized: 0,
        ownerPending: 0,
        commission: 0,
        volume: 0,
      });
    });

    it('cas 6 — séjour fin septembre, clés remises le 1er octobre : revenu propriétaire en octobre', () => {
      const b = booking({ ...KEYS_HANDED, payments: [paid(30000)] });
      expect(summarizeFinance([b], NOW).owner.realizedMonth).toBe(90000);
      expect(summarizeFinance([b], new Date('2026-09-30T23:00:00Z')).owner.realizedMonth).toBe(0);
    });
  });

  describe('dates de comptabilisation', () => {
    it('DodoVroum : mois de la confirmation du propriétaire', () => {
      const b = booking({ ...CONFIRMED, payments: [paid(30000)] });
      expect(summarizeFinance([b], new Date('2026-09-25T12:00:00Z')).platform.realizedMonth).toEqual({
        bookingValue: 100000,
        commission: 10000,
      });
      expect(summarizeFinance([b], NOW).platform.realizedMonth).toEqual({ bookingValue: 0, commission: 0 });
    });

    it('propriétaire : remise par le client datée par keyRetrievedAt', () => {
      const f = bookingFinance(booking({ ...KEYS_HANDED, keyRetrievedAt: new Date('2026-10-02T08:00:00Z') }));
      expect(f.ownerState).toBe('REALIZED');
      expect(f.ownerRealizedAt).toEqual(new Date('2026-10-02T08:00:00Z'));
    });

    it('propriétaire : remise par le propriétaire datée par ownerConfirmedAt réécrit à la remise', () => {
      expect(bookingFinance(booking(KEYS_HANDED)).ownerRealizedAt).toEqual(new Date('2026-10-01T10:00:00Z'));
    });

    it('séjour terminé (check-out) : reste réalisé à la date de remise des clés', () => {
      const f = bookingFinance(booking({ ...KEYS_HANDED, status: 'COMPLETED' }));
      expect(f.ownerState).toBe('REALIZED');
      expect(f.ownerRealizedAt).toEqual(new Date('2026-10-01T10:00:00Z'));
      expect(f.platformState).toBe('REALIZED');
    });
  });

  describe('règles complémentaires', () => {
    it('brouillon non payé, non confirmé : ne compte nulle part', () => {
      expect(view(booking({ status: 'AWAITING_PAYMENT', payments: [paid(30000, { status: 'PENDING' })] }))).toEqual({
        ownerRealized: 0,
        ownerPending: 0,
        commission: 0,
        volume: 0,
      });
    });

    it('expirée : ne compte nulle part', () => {
      expect(view(booking({ status: 'EXPIRED', payments: [paid(30000, { refundRequiredAt: NOW })] }))).toEqual({
        ownerRealized: 0,
        ownerPending: 0,
        commission: 0,
        volume: 0,
      });
    });

    it('paiement à rembourser seul, non confirmée : pas en attente', () => {
      expect(view(booking({ payments: [paid(30000, { refundRequiredAt: NOW })] })).ownerPending).toBe(0);
    });

    it('montants indépendants de la part payée en ligne ; encaissé et reste sur place distincts', () => {
      expect(bookingFinance(booking({ ...KEYS_HANDED, payments: [paid(30000)] }))).toMatchObject({
        bookingValue: 100000,
        onlinePaid: 30000,
        commission: 10000,
        ownerRevenue: 90000,
        remainingOnSite: 70000,
      });
      expect(bookingFinance(booking({ ...KEYS_HANDED, payments: [paid(100000)] }))).toMatchObject({
        onlinePaid: 100000,
        commission: 10000,
        ownerRevenue: 90000,
        remainingOnSite: 0,
      });
    });

    it('paiements historiques FAILED / PENDING non comptés dans l\'encaissé', () => {
      const f = bookingFinance(
        booking({ payments: [paid(30000, { status: 'FAILED' }), paid(30000, { status: 'PENDING' }), paid(30000)] }),
      );
      expect(f.onlinePaid).toBe(30000);
      expect(f.ownerState).toBe('PENDING');
    });

    it.each([
      [100000, 10000, 90000],
      [30000, 3000, 27000],
      [15000, 1500, 13500],
      [200, 20, 180],
      [105, 11, 94], // commission arrondie au FCFA, propriétaire = total − commission
    ])('total %i → commission %i, propriétaire %i (somme = total)', (total, commission, owner) => {
      expect(commissionOf(total)).toBe(commission);
      const f = bookingFinance(booking({ totalPrice: total }));
      expect(f.ownerRevenue).toBe(owner);
      expect(f.commission + f.ownerRevenue).toBe(total);
    });

    it('agrégat : propriétaire (réalisé, mois, attente) et DodoVroum (confirmées, mois) séparés', () => {
      const s = summarizeFinance(
        [
          booking({ ...KEYS_HANDED, payments: [paid(30000)] }), // clés remises en octobre
          booking({ ...CONFIRMED, totalPrice: 200000 }), // confirmée en septembre, clés non remises
          booking({ payments: [paid(100000)] }), // payée, non confirmée
          booking({ status: 'CANCELLED' }), // rien
        ],
        NOW,
      );
      expect(s.owner).toEqual({ realized: 90000, realizedMonth: 90000, pending: 180000 + 90000 });
      expect(s.platform.realized).toEqual({ bookingValue: 300000, commission: 30000 });
      expect(s.platform.realizedMonth).toEqual({ bookingValue: 100000, commission: 10000 });
    });
  });
});
