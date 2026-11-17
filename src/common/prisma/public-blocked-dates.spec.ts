import { ResidencesService } from '../../residences/residences.service';
import { VehiclesService } from '../../vehicles/vehicles.service';
import { PaginationService } from '../services/pagination.service';
import { publicBlockedDateSelect } from './safe-selects';

/**
 * S-0bis : GET /residences/:id/blocked-dates et GET /vehicles/:id/blocked-dates sont
 * publics. Ils n'exposent que { id, startDate, endDate } : ni bookingId, ni reason
 * (note privée du propriétaire), ni horodatages internes.
 */
describe('blocked-dates publics — sélection restreinte (S-0bis)', () => {
  const row = {
    id: 'bd-1',
    startDate: new Date('2026-12-01T00:00:00Z'),
    endDate: new Date('2026-12-05T00:00:00Z'),
  };

  it('la sélection publique se limite à id, startDate, endDate', () => {
    expect(publicBlockedDateSelect).toEqual({ id: true, startDate: true, endDate: true });
  });

  it('résidence : requête restreinte, triée par date de début, réponse inchangée', async () => {
    const prisma: any = { blockedDate: { findMany: jest.fn().mockResolvedValue([row]) } };
    const logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };
    const service = new ResidencesService(prisma, new PaginationService(), {} as any, logger as any);

    await expect(service.getBlockedDates('res-1')).resolves.toEqual([row]);
    expect(prisma.blockedDate.findMany).toHaveBeenCalledWith({
      where: { residenceId: 'res-1' },
      select: { id: true, startDate: true, endDate: true },
      orderBy: { startDate: 'asc' },
    });
  });

  it('véhicule : requête restreinte, triée par date de début, réponse inchangée', async () => {
    const prisma: any = { blockedDate: { findMany: jest.fn().mockResolvedValue([row]) } };
    const service = new VehiclesService(prisma);

    await expect(service.getBlockedDates('veh-1')).resolves.toEqual([row]);
    expect(prisma.blockedDate.findMany).toHaveBeenCalledWith({
      where: { vehicleId: 'veh-1' },
      select: { id: true, startDate: true, endDate: true },
      orderBy: { startDate: 'asc' },
    });
  });

  it.each([['bookingId'], ['reason'], ['residenceId'], ['vehicleId'], ['createdAt'], ['updatedAt']])(
    'la sélection publique ne demande jamais %s',
    (field) => {
      expect(publicBlockedDateSelect).not.toHaveProperty(field);
    },
  );
});
