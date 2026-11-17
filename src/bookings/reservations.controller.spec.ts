import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UserRole } from '@prisma/client';
import { ReservationsController } from './reservations.controller';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingOwnerOrAdminGuard } from './guards/booking-owner-or-admin.guard';

/**
 * S-0bis : GET /reservations ne renvoie que le périmètre du rôle (comme GET /bookings)
 * et DELETE /reservations/:id est réservé aux administrateurs.
 */
describe('ReservationsController — sécurité S-0bis', () => {
  let controller: ReservationsController;
  let bookingsService: Record<string, jest.Mock>;

  const guardsOf = (handler: string): unknown[] =>
    Reflect.getMetadata(GUARDS_METADATA, (ReservationsController.prototype as any)[handler]) ?? [];
  const classGuards = (): unknown[] => Reflect.getMetadata(GUARDS_METADATA, ReservationsController) ?? [];

  beforeEach(() => {
    bookingsService = {
      findAll: jest.fn().mockResolvedValue(['all']),
      findByOwner: jest.fn().mockResolvedValue(['owner']),
      findByUser: jest.fn().mockResolvedValue(['user']),
      remove: jest.fn().mockResolvedValue({ id: 'bk-1' }),
      cancelByClient: jest.fn().mockResolvedValue({ id: 'bk-1' }),
    };
    controller = new ReservationsController(bookingsService as any);
  });

  describe('GET /reservations', () => {
    it('ADMIN : toutes les réservations, sans données financières', async () => {
      await expect(controller.findAll({ user: { id: 'admin-1', role: UserRole.ADMIN } })).resolves.toEqual(['all']);
      expect(bookingsService.findAll).toHaveBeenCalledTimes(1);
      expect(bookingsService.findAll).toHaveBeenCalledWith();
      expect(bookingsService.findByOwner).not.toHaveBeenCalled();
      expect(bookingsService.findByUser).not.toHaveBeenCalled();
    });

    it('PROPRIETAIRE : uniquement les réservations de ses biens', async () => {
      await expect(controller.findAll({ user: { id: 'owner-1', role: UserRole.PROPRIETAIRE } })).resolves.toEqual(['owner']);
      expect(bookingsService.findByOwner).toHaveBeenCalledWith('owner-1');
      expect(bookingsService.findAll).not.toHaveBeenCalled();
      expect(bookingsService.findByUser).not.toHaveBeenCalled();
    });

    it('CLIENT : uniquement ses propres réservations', async () => {
      await expect(controller.findAll({ user: { id: 'client-1', role: UserRole.CLIENT } })).resolves.toEqual(['user']);
      expect(bookingsService.findByUser).toHaveBeenCalledWith('client-1');
      expect(bookingsService.findAll).not.toHaveBeenCalled();
      expect(bookingsService.findByOwner).not.toHaveBeenCalled();
    });

    it.each([['SUPERADMIN'], ['admin'], [''], [undefined], [null]])(
      'rôle inconnu ou absent (%p) : 403, aucun accès par défaut',
      (role) => {
        expect(() => controller.findAll({ user: { id: 'x', role } })).toThrow(ForbiddenException);
        expect(bookingsService.findAll).not.toHaveBeenCalled();
        expect(bookingsService.findByOwner).not.toHaveBeenCalled();
        expect(bookingsService.findByUser).not.toHaveBeenCalled();
      },
    );
  });

  describe('DELETE /reservations/:id', () => {
    it('est protégé par AdminGuard, après le JwtAuthGuard de la classe', () => {
      expect(classGuards()).toEqual([JwtAuthGuard]);
      expect(guardsOf('remove')).toEqual([AdminGuard]);
    });

    it('un admin supprime toujours la réservation', async () => {
      await controller.remove('bk-1');
      expect(bookingsService.remove).toHaveBeenCalledWith('bk-1');
    });
  });

  describe('AdminGuard appliqué à DELETE', () => {
    const contextFor = (user: unknown) =>
      ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;
    const guard = new AdminGuard();

    it.each([[UserRole.CLIENT], [UserRole.PROPRIETAIRE]])('%s : 403', (role) => {
      expect(() => guard.canActivate(contextFor({ id: 'u-1', role }))).toThrow(ForbiddenException);
    });

    it('sans utilisateur : 403', () => {
      expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
    });

    it('ADMIN : autorisé', () => {
      expect(guard.canActivate(contextFor({ id: 'admin-1', role: UserRole.ADMIN }))).toBe(true);
    });
  });

  describe('non-régression des autres routes', () => {
    it("PATCH /:id/cancel reste accessible au client (pas d'AdminGuard)", async () => {
      expect(guardsOf('cancel')).toEqual([]);
      await controller.cancel('bk-1', { user: { id: 'client-1' } });
      expect(bookingsService.cancelByClient).toHaveBeenCalledWith('bk-1', 'client-1');
    });

    it.each([['approve'], ['reject'], ['confirmOwnerKeyHandover']])(
      '%s garde BookingOwnerOrAdminGuard',
      (handler) => {
        expect(guardsOf(handler)).toEqual([BookingOwnerOrAdminGuard]);
      },
    );

    it.each([
      ['createResidenceBooking'],
      ['createVehicleBooking'],
      ['createOfferBooking'],
      ['createPackageBooking'],
      ['create'],
      ['findMyReservations'],
      ['findMyPropertiesReservations'],
      ['findOne'],
      ['updateDates'],
      ['update'],
      ['confirmKeyRetrieval'],
      ['confirmCheckOut'],
    ])("%s : aucun garde ajouté au-delà du JWT de la classe", (handler) => {
      expect(guardsOf(handler)).toEqual([]);
    });
  });
});
