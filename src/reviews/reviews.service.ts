import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async create(createReviewDto: CreateReviewDto, userId: string) {
    // Vérifier que le booking existe
    const booking = await this.prisma.booking.findUnique({
      where: { id: createReviewDto.bookingId },
      include: {
        residence: true,
        vehicle: true,
        offer: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Réservation avec l'ID ${createReviewDto.bookingId} non trouvée`);
    }

    // Vérifier que le booking appartient à l'utilisateur
    if (booking.userId !== userId) {
      throw new ForbiddenException('Vous ne pouvez pas créer un avis pour une réservation qui ne vous appartient pas');
    }

    // Vérifier qu'au moins un ID (residenceId ou vehicleId) est fourni
    if (!createReviewDto.residenceId && !createReviewDto.vehicleId) {
      // Si aucun ID n'est fourni, utiliser ceux du booking
      if (booking.residenceId) {
        createReviewDto.residenceId = booking.residenceId;
      } else if (booking.vehicleId) {
        createReviewDto.vehicleId = booking.vehicleId;
      } else if (booking.offerId) {
        // Si c'est une offre, utiliser la résidence et le véhicule de l'offre
        const offer = await this.prisma.offer.findUnique({
          where: { id: booking.offerId },
          include: {
            residence: true,
            vehicle: true,
          },
        });
        if (offer) {
          createReviewDto.residenceId = offer.residenceId;
          createReviewDto.vehicleId = offer.vehicleId;
        }
      } else {
        throw new BadRequestException('Vous devez fournir soit un residenceId, soit un vehicleId');
      }
    }

    // Vérifier que la résidence existe si fournie
    if (createReviewDto.residenceId) {
      const residence = await this.prisma.residence.findUnique({
        where: { id: createReviewDto.residenceId },
      });

      if (!residence) {
        throw new NotFoundException(`Résidence avec l'ID ${createReviewDto.residenceId} non trouvée`);
      }

      if (!residence.isActive) {
        throw new BadRequestException('Cette résidence n\'est plus disponible');
      }
    }

    // Vérifier que le véhicule existe si fourni
    if (createReviewDto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: createReviewDto.vehicleId },
      });

      if (!vehicle) {
        throw new NotFoundException(`Véhicule avec l'ID ${createReviewDto.vehicleId} non trouvé`);
      }

      if (!vehicle.isActive) {
        throw new BadRequestException('Ce véhicule n\'est plus disponible');
      }
    }

    // Vérifier qu'un avis n'existe pas déjà pour ce booking
    const existingReview = await this.prisma.review.findFirst({
      where: {
        bookingId: createReviewDto.bookingId,
        userId,
      },
    });

    if (existingReview) {
      throw new BadRequestException('Vous avez déjà créé un avis pour cette réservation');
    }

    // Vérifier que la réservation est terminée ou en cours (on peut laisser les utilisateurs noter même si pas terminée)
    // Cette validation est optionnelle selon vos règles métier

    // Créer l'avis
    return this.prisma.review.create({
      data: {
        ...createReviewDto,
        userId, // injecté ici, pas dans le DTO
      } as Prisma.ReviewUncheckedCreateInput,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        residence: true,
        vehicle: true,
        booking: true,
      },
    });
  }

  async findAll() {
    return this.prisma.review.findMany({
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        residence: true,
        vehicle: true,
        booking: true,
      },
    });
  }

  async findOne(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        residence: true,
        vehicle: true,
        booking: true,
      },
    });

    if (!review) {
      throw new NotFoundException('Avis non trouvé');
    }

    return review;
  }

  async findByResidence(residenceId: string) {
    return this.prisma.review.findMany({
      where: { residenceId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async findByVehicle(vehicleId: string) {
    return this.prisma.review.findMany({
      where: { vehicleId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async update(id: string, updateReviewDto: UpdateReviewDto) {
    await this.findOne(id);

    return this.prisma.review.update({
      where: { id },
      data: updateReviewDto,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        residence: true,
        vehicle: true,
        booking: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.review.delete({
      where: { id },
    });
  }
}
