import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBookingDto } from '../dto/create-booking.dto';

@Injectable()
export class BookingValidationService {
  constructor(private prisma: PrismaService) {}

  async validateBooking(createBookingDto: CreateBookingDto): Promise<void> {
    const { startDate, endDate, residenceId, vehicleId, offerId } = createBookingDto;

    // Validation des dates
    await this.validateDates(startDate, endDate);

    // Validation de la logique métier
    await this.validateBookingLogic(residenceId, vehicleId, offerId);

    // Validation des disponibilités
    if (residenceId) {
      await this.validateResidenceAvailability(residenceId, startDate, endDate);
    }
    
    if (vehicleId) {
      await this.validateVehicleAvailability(vehicleId, startDate, endDate);
    }
    
    if (offerId) {
      await this.validateOfferAvailability(offerId, startDate, endDate);
    }
  }

  private async validateDates(startDate: string, endDate: string): Promise<void> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();
    
    // Réinitialiser les heures pour comparer uniquement les dates (sans heures/minutes/secondes)
    const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Vérifier que les dates sont valides
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Format de date invalide');
    }

    // Vérifier que la date de début est aujourd'hui ou dans le futur (on permet aujourd'hui)
    if (startDateOnly < nowDateOnly) {
      throw new BadRequestException('La date de début ne peut pas être dans le passé');
    }

    // Vérifier que la date de fin est après la date de début
    if (end <= start) {
      throw new BadRequestException('La date de fin doit être après la date de début');
    }

    // Vérifier que la réservation ne dépasse pas 30 jours
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 30) {
      throw new BadRequestException('La réservation ne peut pas dépasser 30 jours');
    }
  }

  private async validateBookingLogic(
    residenceId?: string,
    vehicleId?: string,
    offerId?: string,
  ): Promise<void> {
    const hasResidence = !!residenceId;
    const hasVehicle = !!vehicleId;
    const hasOffer = !!offerId;

    // Une réservation doit avoir exactement un type de service
    const serviceCount = [hasResidence, hasVehicle, hasOffer].filter(Boolean).length;
    
    if (serviceCount === 0) {
      throw new BadRequestException('Une réservation doit inclure au moins un service (résidence, véhicule ou offre)');
    }
    
    if (serviceCount > 1) {
      throw new BadRequestException('Une réservation ne peut inclure qu\'un seul type de service à la fois');
    }
  }

  private async validateResidenceAvailability(
    residenceId: string,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    const residence = await this.prisma.residence.findUnique({
      where: { id: residenceId },
    });

    if (!residence) {
      throw new BadRequestException('Résidence non trouvée');
    }

    if (!residence.isActive) {
      throw new BadRequestException('Cette résidence n\'est pas disponible');
    }

    // Vérifier les conflits de réservation
    const conflictingBooking = await this.prisma.booking.findFirst({
      where: {
        residenceId,
        status: {
          in: ['PENDING', 'CONFIRMED', 'CONFIRMEE', 'CHECKIN_CLIENT', 'CHECKIN_PROPRIO', 'EN_COURS_SEJOUR'],
        },
        OR: [
          {
            AND: [
              { startDate: { lte: new Date(startDate) } },
              { endDate: { gt: new Date(startDate) } },
            ],
          },
          {
            AND: [
              { startDate: { lt: new Date(endDate) } },
              { endDate: { gte: new Date(endDate) } },
            ],
          },
          {
            AND: [
              { startDate: { gte: new Date(startDate) } },
              { endDate: { lte: new Date(endDate) } },
            ],
          },
        ],
      },
    });

    if (conflictingBooking) {
      throw new BadRequestException('Cette résidence n\'est pas disponible pour les dates sélectionnées');
    }

    // Vérifier les dates bloquées (si le client Prisma a été régénéré)
    if (this.prisma.blockedDate) {
      const blockedDate = await this.prisma.blockedDate.findFirst({
        where: {
          residenceId,
          OR: [
            {
              AND: [
                { startDate: { lte: new Date(startDate) } },
                { endDate: { gt: new Date(startDate) } },
              ],
            },
            {
              AND: [
                { startDate: { lt: new Date(endDate) } },
                { endDate: { gte: new Date(endDate) } },
              ],
            },
            {
              AND: [
                { startDate: { gte: new Date(startDate) } },
                { endDate: { lte: new Date(endDate) } },
              ],
            },
          ],
        },
      });

      if (blockedDate) {
        throw new BadRequestException('Cette résidence est bloquée pour les dates sélectionnées');
      }
    }
  }

  private async validateVehicleAvailability(
    vehicleId: string,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    // Vérifier que le client Prisma a été régénéré et vérifier les dates bloquées
    if (this.prisma.blockedDate) {
      const blockedDate = await this.prisma.blockedDate.findFirst({
        where: {
          vehicleId,
          OR: [
            {
              AND: [
                { startDate: { lte: new Date(startDate) } },
                { endDate: { gt: new Date(startDate) } },
              ],
            },
            {
              AND: [
                { startDate: { lt: new Date(endDate) } },
                { endDate: { gte: new Date(endDate) } },
              ],
            },
            {
              AND: [
                { startDate: { gte: new Date(startDate) } },
                { endDate: { lte: new Date(endDate) } },
              ],
            },
          ],
        },
      });

      if (blockedDate) {
        throw new BadRequestException('Ce véhicule est bloqué pour les dates sélectionnées');
      }
    }
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new BadRequestException('Véhicule non trouvé');
    }

    if (!vehicle.isActive) {
      throw new BadRequestException('Ce véhicule n\'est pas disponible');
    }

    // Vérifier les conflits de réservation
    const conflictingBooking = await this.prisma.booking.findFirst({
      where: {
        vehicleId,
        status: {
          in: ['PENDING', 'CONFIRMED'],
        },
        OR: [
          {
            AND: [
              { startDate: { lte: new Date(startDate) } },
              { endDate: { gt: new Date(startDate) } },
            ],
          },
          {
            AND: [
              { startDate: { lt: new Date(endDate) } },
              { endDate: { gte: new Date(endDate) } },
            ],
          },
          {
            AND: [
              { startDate: { gte: new Date(startDate) } },
              { endDate: { lte: new Date(endDate) } },
            ],
          },
        ],
      },
    });

    if (conflictingBooking) {
      throw new BadRequestException('Ce véhicule n\'est pas disponible pour les dates sélectionnées');
    }
  }

  private async validateOfferAvailability(
    offerId: string,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        residence: true,
        vehicle: true,
      },
    });

    if (!offer) {
      throw new BadRequestException('Offre non trouvée');
    }

    if (!offer.isActive) {
      throw new BadRequestException('Cette offre n\'est pas disponible');
    }

    const now = new Date();
    if (offer.validFrom > now || offer.validTo < now) {
      throw new BadRequestException('Cette offre n\'est pas valide pour le moment');
    }

    // Vérifier la disponibilité de la résidence et du véhicule
    await this.validateResidenceAvailability(offer.residenceId, startDate, endDate);
    await this.validateVehicleAvailability(offer.vehicleId, startDate, endDate);
  }

  async calculateTotalPrice(
    residenceId?: string,
    vehicleId?: string,
    offerId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<number> {
    if (!startDate || !endDate) {
      throw new BadRequestException('Les dates sont requises pour calculer le prix');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = end.getTime() - start.getTime();
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (offerId) {
      const offer = await this.prisma.offer.findUnique({
        where: { id: offerId },
      });
      
      if (!offer) {
        throw new BadRequestException('Offre non trouvée');
      }
      
      return offer.price * days;
    }

    if (residenceId) {
      const residence = await this.prisma.residence.findUnique({
        where: { id: residenceId },
      });
      
      if (!residence) {
        throw new BadRequestException('Résidence non trouvée');
      }
      
      return residence.pricePerDay * days;
    }

    if (vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
      });
      
      if (!vehicle) {
        throw new BadRequestException('Véhicule non trouvé');
      }
      
      return vehicle.pricePerDay * days;
    }

    throw new BadRequestException('Impossible de calculer le prix');
  }
}
