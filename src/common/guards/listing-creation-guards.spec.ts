import { GUARDS_METADATA } from '@nestjs/common/constants';
import { VehiclesController } from '../../vehicles/vehicles.controller';
import { ResidencesController } from '../../residences/residences.controller';
import { PartnerGuard } from './partner.guard';
import { AdminGuard } from '../../admin/guards/admin.guard';

/**
 * Preuve de câblage (pas seulement de logique en isolation) : la création
 * d'annonces doit être protégée par PartnerGuard (PROPRIETAIRE|ADMIN), et la
 * modération par AdminGuard. Avant ce correctif, POST /vehicles et
 * POST /residences n'avaient aucun contrôle de rôle — n'importe quel CLIENT
 * authentifié pouvait publier une annonce.
 */
describe('Câblage des guards sur la création/modération d\'annonces', () => {
  it('VehiclesController.create est protégé par PartnerGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, VehiclesController.prototype.create) ?? [];
    expect(guards).toContain(PartnerGuard);
  });

  it('ResidencesController.create est protégé par PartnerGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ResidencesController.prototype.create) ?? [];
    expect(guards).toContain(PartnerGuard);
  });

  it('VehiclesController.moderate (modération admin) est protégé par AdminGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, VehiclesController.prototype.moderate) ?? [];
    expect(guards).toContain(AdminGuard);
  });

  it('ResidencesController.moderate (modération admin) est protégé par AdminGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ResidencesController.prototype.moderate) ?? [];
    expect(guards).toContain(AdminGuard);
  });
});
