import { Injectable } from '@nestjs/common';
import { ResidencesService } from '../residences/residences.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { OffersService } from '../offers/offers.service';

@Injectable()
export class SearchService {
  constructor(
    private readonly residencesService: ResidencesService,
    private readonly vehiclesService: VehiclesService,
    private readonly offersService: OffersService,
  ) {}

  /**
   * Recherche globale dans les résidences, véhicules et offres
   * @param query Terme de recherche
   * @returns Résultats combinés de la recherche
   */
  async globalSearch(query: string) {
    // Exécuter les recherches en parallèle
    const [residencesResult, vehiclesResult, offersResult] = await Promise.all([
      this.residencesService.search(query),
      this.vehiclesService.search(query),
      this.offersService.search(query),
    ]);

    // Forcer le typage en tableau
    const residences = Array.isArray(residencesResult) ? residencesResult : [];
    const vehicles = Array.isArray(vehiclesResult) ? vehiclesResult : [];
    const offers = Array.isArray(offersResult) ? offersResult : [];

    return {
      residences,
      vehicles,
      offers,
      total: residences.length + vehicles.length + offers.length,
      query,
    };
  }
}

