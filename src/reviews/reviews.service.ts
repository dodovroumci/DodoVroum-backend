import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

/**
 * @class ReviewsService
 * @description Logique métier complète pour la gestion des avis (Expert Fullstack)
 */
@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async create(createReviewDto: CreateReviewDto, userId: string) {
    const { bookingId, rating, comment, residenceId, vehicleId } = createReviewDto;

    // 1. Vérification réservation
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Réservation introuvable.');
    if (booking.userId !== userId) throw new BadRequestException('Action interdite sur cette réservation.');

    // 2. Un seul avis par booking
    const existing = await this.prisma.review.findFirst({ where: { bookingId } });
    if (existing) throw new BadRequestException('Un avis existe déjà pour ce séjour.');

    // 3. Création
    return this.prisma.review.create({
      data: {
        rating,
        comment,
        userId,
        bookingId,
        residenceId: residenceId || booking.residenceId,
        vehicleId: vehicleId || booking.vehicleId,
      },
    });
  }

  async findAll() {
    return this.prisma.review.findMany({
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByResidence(residenceId: string) {
    return this.prisma.review.findMany({
      where: { residenceId },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByVehicle(vehicleId: string) {
    return this.prisma.review.findMany({
      where: { vehicleId },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!review) throw new NotFoundException('Avis non trouvé.');
    return review;
  }

  async update(id: string, updateReviewDto: UpdateReviewDto, requestingUserId: string, requestingRole: string) {
    const review = await this.findOne(id);
    if (requestingRole !== 'ADMIN' && review.userId !== requestingUserId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres avis.');
    }
    return this.prisma.review.update({
      where: { id },
      data: updateReviewDto,
    });
  }

  async remove(id: string, requestingUserId: string, requestingRole: string) {
    const review = await this.findOne(id);
    if (requestingRole !== 'ADMIN' && review.userId !== requestingUserId) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres avis.');
    }
    return this.prisma.review.delete({ where: { id } });
  }
}
