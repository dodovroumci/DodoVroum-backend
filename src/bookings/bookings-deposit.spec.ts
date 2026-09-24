import { BookingsService } from './bookings.service';

/**
 * Montant du Payment créé avec la réservation : toujours calculé côté serveur.
 * Acompte = règle de l'init GeniusPay (30 %, minimum 200 XOF) ; paiement
 * complet = totalPrice (inchangé). Un downPaymentAmount envoyé par le client
 * est ignoré, sur les trois flux (résidence, véhicule, offre combinée) qui
 * passent tous par BookingsService.create.
 */
describe('BookingsService.create — montant du paiement calculé par le serveur', () => {
  let paymentCreate: jest.Mock;
  let service: BookingsService;

  const build = (totalPrice: number) => {
    paymentCreate = jest.fn(async ({ data }: any) => ({ id: 'pay-1', ...data }));
    const tx = {
      booking: { create: jest.fn(async () => ({ id: 'bk-new' })) },
      payment: { create: paymentCreate },
      blockedDate: { create: jest.fn(async () => ({})) },
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
      offer: { findUnique: jest.fn(async () => ({ residenceId: 'res-1', vehicleId: 'veh-1' })) },
    };
    const validation: any = {
      validateBooking: jest.fn(async () => undefined),
      calculateTotalPrice: jest.fn(async () => totalPrice),
      assertNoBlockingOverlapTx: jest.fn(async () => undefined),
    };
    service = new BookingsService(prisma, validation, {} as any, {} as any);
    jest.spyOn(service as any, 'internalCheckAvailability').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'findOneRaw').mockResolvedValue({ id: 'bk-new' });
    jest.spyOn(service as any, 'sendBookingNotification').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'formatBookingResponse').mockReturnValue({ id: 'bk-new' });
  };

  const dates = { startDate: '2026-10-01', endDate: '2026-10-05' };
  const flows = [
    ['résidence', { residenceId: 'res-1' }],
    ['véhicule', { vehicleId: 'veh-1' }],
    ['offre combinée', { offerId: 'off-1' }],
  ] as const;

  const charged = () => paymentCreate.mock.calls[0][0].data;

  it.each(flows)('%s : acompte arbitraire du client ignoré, 30 %% du totalPrice facturé', async (_flow, target) => {
    build(100000);
    await service.create(
      { ...target, ...dates, paymentOption: 'DOWN_PAYMENT', downPaymentAmount: 200 } as any,
      'client-1',
    );

    expect(charged()).toMatchObject({ amount: 30000, paymentOption: 'DOWN_PAYMENT', status: 'PENDING' });
  });

  it.each(flows)('%s : paiement complet = totalPrice, même si un acompte est envoyé', async (_flow, target) => {
    build(100000);
    await service.create({ ...target, ...dates, downPaymentAmount: 1 } as any, 'client-1');

    expect(charged()).toMatchObject({ amount: 100000, paymentOption: 'FULL_PAYMENT', status: 'PENDING' });
  });

  it('acompte sur un petit montant : minimum 200 XOF', async () => {
    build(500);
    await service.create(
      { residenceId: 'res-1', ...dates, paymentOption: 'DOWN_PAYMENT', downPaymentAmount: 0 } as any,
      'client-1',
    );

    expect(charged().amount).toBe(200);
  });
});
