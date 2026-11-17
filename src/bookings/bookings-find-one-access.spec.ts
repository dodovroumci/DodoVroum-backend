import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingsService } from './bookings.service';

/**
 * GET /bookings/:id : accès réservé au client de la réservation, au propriétaire du bien
 * (résidence, véhicule ou offre) et à l'admin. Réservation inexistante → 404 ; réservation
 * existante mais hors périmètre → 403, sans aucune donnée renvoyée.
 */
describe('BookingsService.findOne — autorisation', () => {
  let service: BookingsService;
  let prisma: any;

  const booking = {
    id: 'bk-1',
    userId: 'client-1',
    status: 'CONFIRMED',
    totalPrice: 100000,
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-09-05'),
    createdAt: new Date('2026-08-01'),
    ownerConfirmedAt: new Date('2026-08-02'),
    keyRetrievedAt: null,
    checkOutAt: null,
    payments: [],
    user: { id: 'client-1', firstName: 'Awa', lastName: 'Traoré', phone: '+2250700000000', email: 'awa@test.ci' },
    residence: {
      id: 'res-1',
      title: 'Villa Cocody',
      ownerId: 'owner-1',
      images: '[]',
      owner: { id: 'owner-1', firstName: 'Koffi', lastName: 'N', phone: '+2250799999999' },
    },
    vehicle: null,
    offer: null,
  };

  beforeEach(() => {
    prisma = { booking: { findUnique: jest.fn(), findFirst: jest.fn() } };
    service = new BookingsService(prisma, {} as any, {} as any, {} as any);
  });

  it('réservation inexistante : 404, sans contrôle de propriété', async () => {
    prisma.booking.findUnique.mockResolvedValue(null);

    await expect(service.findOne('absent', 'client-1', 'CLIENT')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.booking.findFirst).not.toHaveBeenCalled();
  });

  it('utilisateur hors périmètre : 403 « Accès refusé »', async () => {
    prisma.booking.findUnique.mockResolvedValue(booking);
    prisma.booking.findFirst.mockResolvedValue(null);

    const result = service.findOne('bk-1', 'client-2', 'CLIENT');

    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    await expect(result).rejects.toThrow('Accès refusé');
  });

  it('le contrôle porte sur la réservation demandée : client, ou propriétaire de la résidence, du véhicule ou de l’offre', async () => {
    prisma.booking.findUnique.mockResolvedValue(booking);
    prisma.booking.findFirst.mockResolvedValue(null);

    await expect(service.findOne('bk-1', 'user-x', 'PROPRIETAIRE')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.booking.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'bk-1',
        OR: [
          { userId: 'user-x' },
          { residence: { ownerId: 'user-x' } },
          { vehicle: { ownerId: 'user-x' } },
          { offer: { ownerId: 'user-x' } },
        ],
      },
      select: { id: true },
    });
  });

  it('client titulaire : accès, sans détail financier', async () => {
    prisma.booking.findUnique.mockResolvedValue(booking);
    prisma.booking.findFirst.mockResolvedValue({ id: 'bk-1' });

    const res = await service.findOne('bk-1', 'client-1', 'CLIENT');

    expect(res.id).toBe('bk-1');
    expect(res).not.toHaveProperty('finance');
  });

  it('propriétaire du bien : accès, avec détail financier', async () => {
    prisma.booking.findUnique.mockResolvedValue(booking);
    prisma.booking.findFirst.mockResolvedValue({ id: 'bk-1' });

    const res = await service.findOne('bk-1', 'owner-1', 'PROPRIETAIRE');

    expect(res.id).toBe('bk-1');
    expect(res).toHaveProperty('finance');
  });

  it('admin : accès sans contrôle de propriété', async () => {
    prisma.booking.findUnique.mockResolvedValue(booking);

    const res = await service.findOne('bk-1', 'admin-1', 'ADMIN');

    expect(res.id).toBe('bk-1');
    expect(prisma.booking.findFirst).not.toHaveBeenCalled();
  });
});
