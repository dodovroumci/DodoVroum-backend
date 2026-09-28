import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsProcessor, AUTO_CHECKOUT_DELAY_MS } from './bookings.processor';

/**
 * Fin du séjour : confirmée par le client, le propriétaire du bien ou un admin ;
 * sinon automatiquement 24 h après la date de fin.
 */
describe('Fin du séjour (check-out)', () => {
  describe('confirmCheckOut — qui peut terminer le séjour', () => {
    const inStay = (overrides: Record<string, any> = {}) => ({
      status: 'EN_COURS_SEJOUR',
      userId: 'client-1',
      residence: { ownerId: 'owner-1' },
      vehicle: null,
      offer: null,
      ...overrides,
    });

    const build = (booking: any) => {
      const update = jest.fn(async ({ data }: any) => ({ id: 'bk-1', ...booking, ...data }));
      const prisma: any = { booking: { findUnique: jest.fn().mockResolvedValue(booking), update } };
      const service = new BookingsService(prisma, {} as any, {} as any, {} as any);
      jest.spyOn(service as any, 'formatBookingResponse').mockImplementation((b: any) => b);
      return { service, update };
    };

    it.each([
      ['le client de la réservation', inStay(), 'client-1', 'CLIENT'],
      ['le propriétaire de la résidence', inStay(), 'owner-1', 'PROPRIETAIRE'],
      ['le propriétaire du véhicule', inStay({ residence: null, vehicle: { ownerId: 'owner-2' } }), 'owner-2', 'PROPRIETAIRE'],
      ['le propriétaire de l\'offre combinée', inStay({ residence: null, offer: { ownerId: 'owner-3' } }), 'owner-3', 'PROPRIETAIRE'],
      ['un administrateur', inStay(), 'admin-1', 'ADMIN'],
    ])('%s : séjour terminé (COMPLETED + checkOutAt)', async (_who, booking, userId, role) => {
      const { service, update } = build(booking);

      await service.confirmCheckOut('bk-1', userId, role);

      expect(update.mock.calls[0][0].data).toMatchObject({ status: 'COMPLETED' });
      expect(update.mock.calls[0][0].data.checkOutAt).toBeInstanceOf(Date);
      // Les dates de remise des clés (comptabilisation du revenu) ne sont pas touchées.
      expect(update.mock.calls[0][0].data).not.toHaveProperty('ownerConfirmedAt');
      expect(update.mock.calls[0][0].data).not.toHaveProperty('keyRetrievedAt');
    });

    it.each([
      ['un autre propriétaire', 'owner-9', 'PROPRIETAIRE'],
      ['un autre client', 'client-9', 'CLIENT'],
    ])('%s : refusé (403)', async (_who, userId, role) => {
      const { service, update } = build(inStay());
      await expect(service.confirmCheckOut('bk-1', userId, role)).rejects.toBeInstanceOf(ForbiddenException);
      expect(update).not.toHaveBeenCalled();
    });

    it('séjour pas encore commencé (CONFIRMED) : refusé (400), même pour le propriétaire', async () => {
      const { service, update } = build(inStay({ status: 'CONFIRMED' }));
      await expect(service.confirmCheckOut('bk-1', 'owner-1', 'PROPRIETAIRE')).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('handleAutoCheckout — fin automatique 24 h après la date de fin', () => {
    const NOW = new Date('2026-10-02T12:00:00Z');
    beforeAll(() => jest.useFakeTimers().setSystemTime(NOW));
    afterAll(() => jest.useRealTimers());

    it('termine les séjours en cours dont la fin est dépassée depuis 24 h, sans toucher aux dates de remise', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 2 });
      await new BookingsProcessor({ booking: { updateMany } } as any).handleAutoCheckout();

      const { where, data } = updateMany.mock.calls[0][0];
      expect(AUTO_CHECKOUT_DELAY_MS).toBe(24 * 60 * 60 * 1000);
      expect(where).toEqual({
        status: { in: ['EN_COURS_SEJOUR', 'ONGOING'] },
        endDate: { lte: new Date('2026-10-01T12:00:00Z') },
        deletedAt: null,
      });
      expect(data).toEqual({ status: 'COMPLETED', checkOutAt: NOW });
    });

    it('erreur base de données : journalisée, sans faire tomber la tâche', async () => {
      const updateMany = jest.fn().mockRejectedValue(new Error('DB down'));
      await expect(new BookingsProcessor({ booking: { updateMany } } as any).handleAutoCheckout()).resolves.toBeUndefined();
    });
  });
});
