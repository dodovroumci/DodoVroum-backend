import { BadGatewayException, ConflictException } from '@nestjs/common';
import axios from 'axios';
import { PaymentsService } from './payments.service';

jest.mock('axios');
const mockedPost = axios.post as jest.Mock;

/**
 * Faux Prisma en mémoire : reproduit fidèlement la sémantique utilisée par le
 * service (updateMany conditionnel → count, findFirst trié, $transaction).
 * Chaque opération est atomique vis-à-vis de l'event loop, comme une requête SQL.
 */
class FakePrisma {
  bookings = new Map<string, any>();
  payments: any[] = [];
  private seq = 0;

  private matches(row: any, where: any = {}): boolean {
    return Object.entries(where).every(([key, cond]: [string, any]) => {
      if (key === 'OR') return cond.some((w: any) => this.matches(row, w));
      const value = row[key];
      if (cond === null) return value === null || value === undefined;
      if (cond instanceof Date) return value?.getTime() === cond.getTime();
      if (typeof cond === 'object') {
        if ('in' in cond) return cond.in.includes(value);
        if ('not' in cond) return value !== cond.not;
        if ('lt' in cond) return value !== null && value !== undefined && value < cond.lt;
      }
      return value === cond;
    });
  }

  private sorted(rows: any[], orderBy?: any) {
    if (orderBy?.createdAt === 'desc') return [...rows].sort((a, b) => b.createdAt - a.createdAt);
    return rows;
  }

  addPayment(data: any) {
    const row = {
      id: `pay-${++this.seq}`,
      baseAmount: null,
      fees: null,
      currency: 'XOF',
      status: 'PENDING',
      method: 'CARD',
      transactionId: null,
      webhookEventId: null,
      paymentOption: null,
      checkoutUrl: null,
      checkoutExpiresAt: null,
      checkoutRequestedAt: null,
      refundRequiredAt: null,
      refundReason: null,
      createdAt: new Date(1_000_000 + this.seq),
      ...data,
    };
    this.payments.push(row);
    return row;
  }

  booking = {
    findUnique: async ({ where }: any) => {
      const b = this.bookings.get(where.id);
      return b ? { ...b } : null;
    },
    updateMany: async ({ where, data }: any) => {
      const b = this.bookings.get(where.id);
      if (!b || !this.matches(b, where)) return { count: 0 };
      Object.assign(b, data);
      return { count: 1 };
    },
  };

  payment = {
    findFirst: async ({ where, orderBy }: any) => {
      const row = this.sorted(this.payments.filter((p) => this.matches(p, where)), orderBy)[0];
      return row ? { ...row } : null;
    },
    findUnique: async ({ where }: any) => {
      const row = this.payments.find((p) => p.id === where.id);
      return row ? { ...row } : null;
    },
    create: async ({ data }: any) => ({ ...this.addPayment(data) }),
    update: async ({ where, data }: any) => {
      const row = this.payments.find((p) => p.id === where.id);
      Object.assign(row, data);
      return { ...row };
    },
    updateMany: async ({ where, data }: any) => {
      const rows = this.payments.filter((p) => this.matches(p, where));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    },
  };

  $transaction = async (fn: (tx: any) => Promise<any>) => fn(this);
}

class TestPaymentsService extends PaymentsService {
  clock = new Date('2026-09-22T10:00:00Z');
  protected now() {
    return new Date(this.clock);
  }
  protected sleep() {
    return new Promise<void>((resolve) => setImmediate(resolve));
  }
}

const HOUR = 60 * 60 * 1000;

describe('PaymentsService — sessions GeniusPay et webhook', () => {
  let prisma: FakePrisma;
  let service: TestPaymentsService;
  let sessions: number;

  const config = {
    get: (key: string) =>
      ({
        GENIUSPAY_API_URL: 'https://pay.genius.ci/api/v1/merchant/payments',
        GENIUSPAY_SUCCESS_URL: 'https://api.dodovroum.com/api/payments/redirect/success',
        GENIUSPAY_CANCEL_URL: 'https://api.dodovroum.com/api/payments/redirect/cancel',
      })[key],
  };

  /** Réservation telle que créée par BookingsService (avec son Payment PENDING). */
  const seedBooking = (overrides: Record<string, any> = {}, paymentOption = 'FULL_PAYMENT') => {
    const booking = {
      id: 'bk-1',
      userId: 'client-1',
      status: 'AWAITING_PAYMENT',
      totalPrice: 100000,
      createdAt: new Date(service.clock.getTime() - HOUR),
      ownerConfirmedAt: null,
      user: { firstName: 'Awa', lastName: 'Traoré', email: 'awa@test.ci' },
      ...overrides,
    };
    prisma.bookings.set(booking.id, booking);
    const payment = prisma.addPayment({
      amount: paymentOption === 'DOWN_PAYMENT' ? 30000 : 100000,
      paymentOption,
      userId: booking.userId,
      bookingId: booking.id,
    });
    return { booking, payment };
  };

  const init = (paymentType?: string) =>
    service.initializeGeniusPayPayment('bk-1', 'client-1', paymentType) as Promise<any>;

  const pendingPayments = () => prisma.payments.filter((p) => p.status === 'PENDING');

  beforeEach(() => {
    prisma = new FakePrisma();
    service = new TestPaymentsService(prisma as any, config as any);
    sessions = 0;
    mockedPost.mockReset();
    mockedPost.mockImplementation(async () => {
      await new Promise((resolve) => setImmediate(resolve)); // latence réseau
      const n = ++sessions;
      return {
        data: {
          success: true,
          data: {
            reference: `MTX-${n}`,
            checkout_url: `https://pay.genius.ci/checkout/${n}`,
            expires_at: new Date(service.clock.getTime() + 24 * HOUR).toISOString(),
          },
        },
      };
    });
  });

  describe('init', () => {
    it('1. première initialisation : crée une session GeniusPay et la stocke', async () => {
      const { payment } = seedBooking();

      const result = await init('FULL');

      expect(result).toEqual({
        checkoutUrl: 'https://pay.genius.ci/checkout/1',
        paymentId: payment.id,
        reused: false,
      });
      expect(mockedPost).toHaveBeenCalledTimes(1);
      const body = mockedPost.mock.calls[0][1];
      expect(body.metadata).toEqual({ bookingId: 'bk-1', paymentId: payment.id });
      expect(body.success_url).toContain('bookingId=bk-1');
      const stored = prisma.payments[0];
      expect(stored.transactionId).toBe('MTX-1');
      expect(stored.checkoutUrl).toBe('https://pay.genius.ci/checkout/1');
      expect(stored.checkoutExpiresAt).toEqual(new Date(service.clock.getTime() + 24 * HOUR));
      expect(stored.checkoutRequestedAt).toBeNull();
    });

    it('2. deuxième initialisation : même checkout, aucune nouvelle transaction', async () => {
      seedBooking();
      const first = await init('FULL');
      const second = await init();

      expect(second).toEqual({ ...first, reused: true });
      expect(mockedPost).toHaveBeenCalledTimes(1);
      expect(prisma.payments).toHaveLength(1);
      expect(prisma.payments[0].transactionId).toBe('MTX-1');
    });

    it('3. appels simultanés (double clic, deux écrans) : une seule transaction', async () => {
      seedBooking();

      const results = await Promise.all([init('FULL'), init(), init('FULL')]);

      expect(mockedPost).toHaveBeenCalledTimes(1);
      expect(new Set(results.map((r) => r.checkoutUrl))).toEqual(new Set(['https://pay.genius.ci/checkout/1']));
      expect(results.filter((r) => r.reused === false)).toHaveLength(1);
      expect(prisma.payments).toHaveLength(1);
    });

    it('4. réservation déjà PAID : aucun appel GeniusPay', async () => {
      seedBooking({ status: 'PAID' });
      await expect(init()).resolves.toEqual({ status: 'already_paid', bookingId: 'bk-1', paid: true });
      expect(mockedPost).not.toHaveBeenCalled();
    });

    it('4b. paiement COMPLETED existant : already_paid, aucune transaction', async () => {
      const { payment } = seedBooking();
      payment.status = 'COMPLETED';
      await expect(init()).resolves.toMatchObject({ status: 'already_paid' });
      expect(mockedPost).not.toHaveBeenCalled();
    });

    it('4c. réservation approuvée sans paiement (CONFIRMED) : refusée, pas de transaction', async () => {
      seedBooking({ status: 'CONFIRMED' });
      await expect(init()).rejects.toBeInstanceOf(ConflictException);
      expect(mockedPost).not.toHaveBeenCalled();
    });

    it.each(['EXPIRED', 'CANCELLED'])('5. réservation %s : paiement refusé', async (status) => {
      seedBooking({ status });
      await expect(init()).rejects.toBeInstanceOf(ConflictException);
      expect(mockedPost).not.toHaveBeenCalled();
      expect(prisma.payments).toHaveLength(1);
    });

    it('5b. plus de 48 h sans paiement (cron pas encore passé) : paiement refusé', async () => {
      seedBooking({ createdAt: new Date(service.clock.getTime() - 48 * HOUR) });
      await expect(init()).rejects.toBeInstanceOf(ConflictException);
      expect(mockedPost).not.toHaveBeenCalled();
    });

    it('6. FULL : une reprise conserve le paiement complet même si DEPOSIT est demandé', async () => {
      seedBooking();
      await init('FULL');
      const resumed = await init('DEPOSIT');

      expect(resumed.reused).toBe(true);
      expect(mockedPost).toHaveBeenCalledTimes(1);
      expect(prisma.payments[0]).toMatchObject({ amount: 100000, paymentOption: 'FULL_PAYMENT' });
    });

    it('7. DEPOSIT : une nouvelle session (checkout expiré) conserve montant et type', async () => {
      seedBooking(); // créé en FULL par la réservation, acompte choisi à la 1re init
      await init('DEPOSIT');
      expect(prisma.payments[0]).toMatchObject({ amount: 30000, paymentOption: 'DOWN_PAYMENT' });

      service.clock = new Date(service.clock.getTime() + 25 * HOUR); // checkout GeniusPay expiré
      prisma.bookings.get('bk-1').createdAt = new Date(service.clock.getTime() - HOUR);
      const resumed = await init();

      expect(resumed.reused).toBe(false);
      expect(mockedPost).toHaveBeenCalledTimes(2);
      expect(mockedPost.mock.calls[1][1].amount).toBe(30000);
      const [old, current] = prisma.payments;
      expect(old).toMatchObject({ status: 'FAILED', transactionId: 'MTX-1' });
      expect(current).toMatchObject({
        status: 'PENDING',
        amount: 30000,
        paymentOption: 'DOWN_PAYMENT',
        transactionId: 'MTX-2',
      });
      expect(resumed.paymentId).toBe(current.id);
    });

    it('checkout proche de l\'expiration : remplacé plutôt que réutilisé', async () => {
      seedBooking();
      await init('FULL');
      service.clock = new Date(service.clock.getTime() + 24 * HOUR - 60 * 1000);
      prisma.bookings.get('bk-1').createdAt = new Date(service.clock.getTime() - HOUR);

      const result = await init();
      expect(result.reused).toBe(false);
      expect(pendingPayments()).toHaveLength(1);
    });

    it('Payment antérieur à la migration (référence sans checkout) : jamais écrasé', async () => {
      const { payment } = seedBooking();
      payment.transactionId = 'LEGACY-REF';

      await init();

      expect(prisma.payments[0]).toMatchObject({ status: 'FAILED', transactionId: 'LEGACY-REF' });
      expect(prisma.payments[1]).toMatchObject({ status: 'PENDING', transactionId: 'MTX-1', amount: 100000 });
    });

    it('échec GeniusPay : verrou relâché, une nouvelle tentative crée la session', async () => {
      seedBooking();
      mockedPost.mockRejectedValueOnce(new Error('ECONNRESET'));

      await expect(init('FULL')).rejects.toBeInstanceOf(BadGatewayException);
      expect(prisma.payments[0]).toMatchObject({ transactionId: null, checkoutRequestedAt: null });

      await expect(init('FULL')).resolves.toMatchObject({ reused: false });
      expect(prisma.payments).toHaveLength(1);
    });
  });

  describe('webhook', () => {
    const webhook = (ref: string, amount?: number, metadata?: any) =>
      service.validatePayment(ref, amount, 'momo', metadata);

    it('paiement nominal : Payment COMPLETED, réservation PAID', async () => {
      seedBooking();
      const { paymentId } = await init('FULL');

      await expect(webhook('MTX-1', 100000, { bookingId: 'bk-1', paymentId })).resolves.toEqual({
        status: 'success',
      });
      expect(prisma.payments[0]).toMatchObject({
        status: 'COMPLETED',
        method: 'MOBILE_MONEY',
        webhookEventId: 'MTX-1',
        refundRequiredAt: null,
      });
      expect(prisma.bookings.get('bk-1').status).toBe('PAID');
    });

    it('encaissement : paidAt = date du webhook, inchangé par une seconde livraison', async () => {
      seedBooking();
      await init('FULL');
      expect(prisma.payments[0].paidAt ?? null).toBeNull();

      const paidAt = new Date(service.clock);
      await expect(webhook('MTX-1', 100000)).resolves.toEqual({ status: 'success' });
      expect(prisma.payments[0].paidAt).toEqual(paidAt);

      service.clock = new Date(service.clock.getTime() + 2 * HOUR);
      await expect(webhook('MTX-1', 100000)).resolves.toEqual({ status: 'already_processed' });
      expect(prisma.payments[0].paidAt).toEqual(paidAt);
    });

    it('8/10. ancienne référence (session remplacée) payée : Payment identifié, réservation confirmée', async () => {
      seedBooking();
      await init('FULL');
      service.clock = new Date(service.clock.getTime() + 25 * HOUR);
      prisma.bookings.get('bk-1').createdAt = new Date(service.clock.getTime() - HOUR);
      await init(); // nouvelle session MTX-2, MTX-1 passe FAILED

      await expect(webhook('MTX-1', 100000)).resolves.toEqual({ status: 'success' });
      expect(prisma.payments[0]).toMatchObject({ status: 'COMPLETED', transactionId: 'MTX-1' });
      expect(prisma.bookings.get('bk-1').status).toBe('PAID');
      await expect(init()).resolves.toMatchObject({ status: 'already_paid' });
    });

    it('9. webhook reçu deux fois : un seul traitement', async () => {
      seedBooking();
      await init('FULL');

      await expect(webhook('MTX-1', 100000)).resolves.toEqual({ status: 'success' });
      await expect(webhook('MTX-1', 100000)).resolves.toEqual({ status: 'already_processed' });
      await expect(Promise.all([webhook('MTX-1', 100000), webhook('MTX-1', 100000)])).resolves.toEqual([
        { status: 'already_processed' },
        { status: 'already_processed' },
      ]);
      expect(prisma.payments.filter((p) => p.status === 'COMPLETED')).toHaveLength(1);
    });

    it('livraisons simultanées : un seul passage à COMPLETED', async () => {
      seedBooking();
      await init('FULL');

      const results = await Promise.all([webhook('MTX-1', 100000), webhook('MTX-1', 100000)]);
      expect(results.map((r) => r.status).sort()).toEqual(['already_processed', 'success']);
    });

    it('réservation EXPIRED : Payment COMPLETED + à rembourser, réservation inchangée', async () => {
      seedBooking();
      const { paymentId } = await init('FULL');
      prisma.bookings.get('bk-1').status = 'EXPIRED';

      await expect(webhook('MTX-1', 100000)).resolves.toEqual({ status: 'refund_required' });
      expect(prisma.payments[0]).toMatchObject({
        id: paymentId,
        status: 'COMPLETED',
        refundReason: 'BOOKING_EXPIRED',
        refundRequiredAt: service.clock,
      });
      expect(prisma.bookings.get('bk-1').status).toBe('EXPIRED');
    });

    it('réservation CANCELLED : remboursement BOOKING_CANCELLED', async () => {
      seedBooking();
      await init('FULL');
      prisma.bookings.get('bk-1').status = 'CANCELLED';

      await webhook('MTX-1', 100000);
      expect(prisma.payments[0].refundReason).toBe('BOOKING_CANCELLED');
      expect(prisma.bookings.get('bk-1').status).toBe('CANCELLED');
    });

    it('double paiement (ancien + nouveau checkout) : le second est à rembourser', async () => {
      seedBooking();
      await init('FULL');
      service.clock = new Date(service.clock.getTime() + 25 * HOUR);
      prisma.bookings.get('bk-1').createdAt = new Date(service.clock.getTime() - HOUR);
      await init();

      await expect(webhook('MTX-2', 100000)).resolves.toEqual({ status: 'success' });
      await expect(webhook('MTX-1', 100000)).resolves.toEqual({ status: 'refund_required' });

      expect(prisma.payments[1]).toMatchObject({ status: 'COMPLETED', refundRequiredAt: null });
      expect(prisma.payments[0]).toMatchObject({ status: 'COMPLETED', refundReason: 'DOUBLE_PAYMENT' });
      expect(prisma.bookings.get('bk-1').status).toBe('PAID');
    });

    it('metadata incohérente (autre réservation) : rejeté sans modification', async () => {
      seedBooking();
      await init('FULL');

      await expect(webhook('MTX-1', 100000, { bookingId: 'bk-other', paymentId: 'x' })).resolves.toEqual({
        status: 'metadata_mismatch',
      });
      expect(prisma.payments[0].status).toBe('PENDING');
      expect(prisma.bookings.get('bk-1').status).toBe('AWAITING_PAYMENT');
    });

    it('référence inconnue : repli sur metadata.paymentId seulement si bookingId concorde', async () => {
      const { payment } = seedBooking();

      await expect(webhook('MTX-UNKNOWN', 100000, { paymentId: payment.id })).resolves.toEqual({
        status: 'not_found',
      });
      await expect(
        webhook('MTX-UNKNOWN', 100000, { paymentId: payment.id, bookingId: 'bk-other' }),
      ).resolves.toEqual({ status: 'not_found' });
      await expect(
        webhook('MTX-UNKNOWN', 100000, { paymentId: payment.id, bookingId: 'bk-1' }),
      ).resolves.toEqual({ status: 'success' });
    });

    it('jamais de rattachement par bookingId seul', async () => {
      seedBooking();
      await expect(webhook('bk-1', 100000)).resolves.toEqual({ status: 'not_found' });
      expect(prisma.bookings.get('bk-1').status).toBe('AWAITING_PAYMENT');
    });

    it('montant incohérent : aucune modification', async () => {
      seedBooking();
      await init('FULL');
      await expect(webhook('MTX-1', 5000)).resolves.toEqual({ status: 'amount_mismatch' });
      expect(prisma.payments[0].status).toBe('PENDING');
    });
  });
  describe('sécurité : statut et montants fixés par le serveur', () => {
    const webhook = (ref: string, amount?: number) => service.validatePayment(ref, amount, 'momo');

    it('create() : statut/paidAt/transactionId/webhookEventId/refundRequiredAt glissés dans le payload ignorés', async () => {
      seedBooking();
      const smuggled: any = {
        amount: 100000,
        method: 'CARD',
        bookingId: 'bk-1',
        status: 'COMPLETED',
        paidAt: new Date('2020-01-01T00:00:00Z'),
        transactionId: 'MTX-VOLE',
        webhookEventId: 'MTX-VOLE',
        refundRequiredAt: new Date('2020-01-01T00:00:00Z'),
        paymentOption: 'DOWN_PAYMENT',
      };

      const created = await service.create(smuggled, 'admin-1');

      expect(created).toMatchObject({
        status: 'PENDING',
        transactionId: null,
        webhookEventId: null,
        refundRequiredAt: null,
        paymentOption: null,
      });
      expect(created.paidAt ?? null).toBeNull();
    });

    it('create() : les paiements existants ne sont pas modifiés', async () => {
      seedBooking();
      const before = prisma.payments.map((p) => ({ ...p }));

      await service.create({ amount: 5000, method: 'CARD', bookingId: 'bk-1' } as any, 'admin-1');

      expect(prisma.payments).toHaveLength(before.length + 1);
      expect(prisma.payments.slice(0, before.length)).toEqual(before);
    });

    it('acompte = 30 % du totalPrice à l\'initialisation (règle inchangée)', async () => {
      seedBooking({}, 'DOWN_PAYMENT');
      await init('DEPOSIT');
      expect(mockedPost.mock.calls[0][1].amount).toBe(30000);
    });

    it('webhook livré deux fois : un seul paiement COMPLETED, montant non doublé', async () => {
      seedBooking();
      await init('FULL');
      await expect(webhook('MTX-1', 100000)).resolves.toEqual({ status: 'success' });
      await expect(webhook('MTX-1', 100000)).resolves.toEqual({ status: 'already_processed' });

      const collected = prisma.payments
        .filter((p) => p.status === 'COMPLETED' && !p.refundRequiredAt)
        .reduce((sum, p) => sum + p.amount, 0);
      expect(collected).toBe(100000);
    });
  });
});
