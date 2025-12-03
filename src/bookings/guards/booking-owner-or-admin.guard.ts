import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class BookingOwnerOrAdminGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const bookingId = request.params.id;

    if (!user) {
      throw new ForbiddenException('Utilisateur non authentifié');
    }

    // Les administrateurs peuvent toujours approuver
    if (user.role === 'ADMIN') {
      return true;
    }

    // Récupérer la réservation avec les informations du propriétaire
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        residence: {
          select: { ownerId: true },
        },
        vehicle: {
          select: { ownerId: true },
        },
        offer: {
          select: { ownerId: true },
        },
      },
    });

    if (!booking) {
      throw new ForbiddenException('Réservation non trouvée');
    }

    // Vérifier si l'utilisateur est propriétaire de la résidence, du véhicule ou de l'offre
    const isOwner =
      (booking.residence && booking.residence.ownerId === user.id) ||
      (booking.vehicle && booking.vehicle.ownerId === user.id) ||
      (booking.offer && booking.offer.ownerId === user.id);

    if (!isOwner) {
      throw new ForbiddenException(
        'Vous devez être le propriétaire de la résidence/véhicule/offre ou un administrateur pour approuver cette réservation'
      );
    }

    return true;
  }
}

