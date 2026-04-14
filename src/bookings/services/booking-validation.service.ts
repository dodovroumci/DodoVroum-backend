import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBookingDto } from '../dto/create-booking.dto';

@Injectable()
export class BookingValidationService {
  /** Fenêtre pendant laquelle un booking `PENDING` (paiement en cours) bloque le créneau. */
  private static readonly PAYMENT_HOLD_MS = 15 * 60 * 1000;

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

  /**
   * Filtre statut + dates pour les conflits :
   * - statuts « fermes » toujours bloquants ;
   * - `PENDING` seulement si créé récemment (créneau réservé le temps du paiement).
   */
  private buildOverlapWhere(
    startDate: string,
    endDate: string,
    excludeBookingId?: string,
  ): Prisma.BookingWhereInput {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const pendingSince = new Date(Date.now() - BookingValidationService.PAYMENT_HOLD_MS);

    const alwaysBlock: BookingStatus[] = [
      BookingStatus.PAID,
      BookingStatus.CONFIRMED,
      BookingStatus.CONFIRMEE,
      BookingStatus.CHECKIN_CLIENT,
      BookingStatus.CHECKIN_PROPRIO,
      BookingStatus.EN_COURS_SEJOUR,
      BookingStatus.ONGOING,
    ];

    return {
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      AND: [
        {
          OR: [
            { status: { in: alwaysBlock } },
            { AND: [{ status: BookingStatus.PENDING }, { createdAt: { gte: pendingSince } }] },
          ],
        },
        {
          OR: [
            { AND: [{ startDate: { lte: start } }, { endDate: { gt: start } }] },
            { AND: [{ startDate: { lt: end } }, { endDate: { gte: end } }] },
            { AND: [{ startDate: { gte: start } }, { endDate: { lte: end } }] },
          ],
        },
      ],
    };
  }

  /**
   * Vérifie les chevauchements (verrou ~15 min sur PENDING) avant création — hors transaction.
   */
  async assertNoBlockingOverlapBeforeCreate(dto: CreateBookingDto): Promise<void> {
    await this.runAssertNoBlockingOverlap(this.prisma, dto);
  }

  /**
   * Même vérification à l’intérieur d’une transaction Prisma (si besoin ailleurs).
   */
  async assertNoBlockingOverlapTx(tx: Prisma.TransactionClient, dto: CreateBookingDto): Promise<void> {
    await this.runAssertNoBlockingOverlap(tx, dto);
  }

  private async runAssertNoBlockingOverlap(
    db: Pick<PrismaService, 'booking' | 'offer'>,
    dto: CreateBookingDto,
  ): Promise<void> {
    const { startDate, endDate, residenceId, vehicleId, offerId } = dto;

    if (offerId) {
      const offer = await db.offer.findUnique({
        where: { id: offerId },
        select: { residenceId: true, vehicleId: true },
      });
      if (!offer) {
        throw new BadRequestException('Offre non trouvée');
      }

      const byOffer = await db.booking.findFirst({
        where: {
          offerId,
          ...this.buildOverlapWhere(startDate, endDate),
        },
      });
      if (byOffer) {
        throw new BadRequestException(
          'Cette période est déjà réservée ou un paiement est en cours. Réessayez plus tard.',
        );
      }

      const byRes = await db.booking.findFirst({
        where: {
          OR: [{ residenceId: offer.residenceId }, { offer: { residenceId: offer.residenceId } }],
          ...this.buildOverlapWhere(startDate, endDate),
        },
      });
      if (byRes) {
        throw new BadRequestException(
          'Cette période est déjà réservée ou un paiement est en cours. Réessayez plus tard.',
        );
      }

      const byVeh = await db.booking.findFirst({
        where: {
          OR: [{ vehicleId: offer.vehicleId }, { offer: { vehicleId: offer.vehicleId } }],
          ...this.buildOverlapWhere(startDate, endDate),
        },
      });
      if (byVeh) {
        throw new BadRequestException(
          'Cette période est déjà réservée ou un paiement est en cours. Réessayez plus tard.',
        );
      }
      return;
    }

    if (residenceId) {
      const conflict = await db.booking.findFirst({
        where: {
          OR: [{ residenceId }, { offer: { residenceId } }],
          ...this.buildOverlapWhere(startDate, endDate),
        },
      });
      if (conflict) {
        throw new BadRequestException(
          'Cette période est déjà réservée ou un paiement est en cours. Réessayez plus tard.',
        );
      }
    }

    if (vehicleId) {
      const conflict = await db.booking.findFirst({
        where: {
          OR: [{ vehicleId }, { offer: { vehicleId } }],
          ...this.buildOverlapWhere(startDate, endDate),
        },
      });
      if (conflict) {
        throw new BadRequestException(
          'Cette période est déjà réservée ou un paiement est en cours. Réessayez plus tard.',
        );
      }
    }
  }

  async validateRescheduleDates(
    booking: {
      id: string;
      residenceId: string | null;
      vehicleId: string | null;
      offerId: string | null;
    },
    startDate: string,
    endDate: string,
  ): Promise<void> {
    await this.validateDates(startDate, endDate);

    const { residenceId, vehicleId, offerId } = booking;
    const hasResidence = !!residenceId;
    const hasVehicle = !!vehicleId;
    const hasOffer = !!offerId;
    const serviceCount = [hasResidence, hasVehicle, hasOffer].filter(Boolean).length;
    if (serviceCount !== 1) {
      throw new BadRequestException('Réservation invalide : un seul service attendu');
    }

    if (offerId) {
      await this.validateOfferAvailability(offerId, startDate, endDate, booking.id);
    } else if (residenceId) {
      await this.validateResidenceAvailability(residenceId, startDate, endDate, booking.id);
    } else if (vehicleId) {
      await this.validateVehicleAvailability(vehicleId, startDate, endDate, booking.id);
    }
  }

  private async validateResidenceAvailability(
    residenceId: string,
    startDate: string,
    endDate: string,
    excludeBookingId?: string,
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

    // Vérifier les conflits de réservation (résidence directe ou pack / offre sur cette résidence)
    const conflictingBooking = await this.prisma.booking.findFirst({
      where: {
        OR: [{ residenceId }, { offer: { residenceId } }],
        ...this.buildOverlapWhere(startDate, endDate, excludeBookingId),
      },
    });

    if (conflictingBooking) {
      if (excludeBookingId) {
        throw new ConflictException('Ces dates sont déjà occupées.');
      }
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
        if (excludeBookingId) {
          throw new ConflictException('Ces dates sont bloquées pour ce logement.');
        }
        throw new BadRequestException('Cette résidence est bloquée pour les dates sélectionnées');
      }
    }
  }

  private async validateVehicleAvailability(
    vehicleId: string,
    startDate: string,
    endDate: string,
    excludeBookingId?: string,
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
        if (excludeBookingId) {
          throw new ConflictException('Ces dates sont bloquées pour ce véhicule.');
        }
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

    // Vérifier les conflits de réservation (véhicule direct ou offre incluant ce véhicule)
    const conflictingBooking = await this.prisma.booking.findFirst({
      where: {
        OR: [{ vehicleId }, { offer: { vehicleId } }],
        ...this.buildOverlapWhere(startDate, endDate, excludeBookingId),
      },
    });

    if (conflictingBooking) {
      if (excludeBookingId) {
        throw new ConflictException('Ces dates sont déjà occupées.');
      }
      throw new BadRequestException('Ce véhicule n\'est pas disponible pour les dates sélectionnées');
    }
  }

  private async validateOfferAvailability(
    offerId: string,
    startDate: string,
    endDate: string,
    excludeBookingId?: string,
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

    const sameOfferOverlap = await this.prisma.booking.findFirst({
      where: {
        offerId,
        ...this.buildOverlapWhere(startDate, endDate, excludeBookingId),
      },
    });
    if (sameOfferOverlap) {
      if (excludeBookingId) {
        throw new ConflictException('Ces dates sont déjà occupées.');
      }
      throw new BadRequestException('Cette offre n\'est pas disponible pour les dates sélectionnées');
    }

    // Vérifier la disponibilité de la résidence et du véhicule
    await this.validateResidenceAvailability(offer.residenceId, startDate, endDate, excludeBookingId);
    await this.validateVehicleAvailability(offer.vehicleId, startDate, endDate, excludeBookingId);
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
