import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { BookingValidationService } from './services/booking-validation.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { Prisma, NotificationType, PaymentStatus, PaymentMethod } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private bookingValidationService: BookingValidationService,
    private notificationsService: NotificationsService,
  ) {}

  async create(createBookingDto: CreateBookingDto, userId: string) {
    // Validation métier
    await this.bookingValidationService.validateBooking(createBookingDto);

    // Calcul automatique du prix si non fourni
    let totalPrice = createBookingDto.totalPrice;
    if (!totalPrice) {
      totalPrice = await this.bookingValidationService.calculateTotalPrice(
        createBookingDto.residenceId,
        createBookingDto.vehicleId,
        createBookingDto.offerId,
        createBookingDto.startDate,
        createBookingDto.endDate,
      );
    }

    // Créer la réservation et le paiement dans une transaction
    const booking = await this.prisma.$transaction(async (tx) => {
      // Créer la réservation
      const newBooking = await tx.booking.create({
        data: {
          ...createBookingDto,
          userId, // injecté ici, pas dans le DTO
          totalPrice,
          startDate: new Date(createBookingDto.startDate),
          endDate: new Date(createBookingDto.endDate),
          // Forcer le statut à PENDING pour nécessiter une approbation
          status: createBookingDto.status || 'PENDING',
        } as Prisma.BookingUncheckedCreateInput,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          residence: true,
          vehicle: true,
          offer: true,
        },
      });

      // Créer automatiquement un paiement pour la réservation
      await tx.payment.create({
        data: {
          amount: totalPrice,
          currency: 'EUR',
          status: PaymentStatus.COMPLETED,
          method: PaymentMethod.CARD, // Par défaut, on considère un paiement par carte
          userId,
          bookingId: newBooking.id,
        },
      });

      return newBooking;
    });

    // Récupérer la réservation avec les paiements pour le formatage
    const bookingWithPayments = await this.prisma.booking.findUnique({
      where: { id: booking.id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        residence: true,
        vehicle: true,
        offer: true,
        payments: true,
        reviews: {
          select: {
            id: true,
          },
        },
      },
    });

    // Envoyer une notification au client
    try {
      const startDate = new Date(createBookingDto.startDate).toLocaleDateString('fr-FR');
      const endDate = new Date(createBookingDto.endDate).toLocaleDateString('fr-FR');
      
      let title = 'Réservation créée avec succès ✅';
      let message = '';

      if (bookingWithPayments.residence?.title) {
        message = `Votre réservation pour "${bookingWithPayments.residence.title}" du ${startDate} au ${endDate} a été créée avec succès. Le paiement a été enregistré. Elle est en attente de validation par le propriétaire.`;
      } else if (bookingWithPayments.vehicle?.brand && bookingWithPayments.vehicle?.model) {
        message = `Votre réservation pour "${bookingWithPayments.vehicle.brand} ${bookingWithPayments.vehicle.model}" du ${startDate} au ${endDate} a été créée avec succès. Le paiement a été enregistré. Elle est en attente de validation par le propriétaire.`;
      } else if (bookingWithPayments.offer?.title) {
        message = `Votre réservation pour l'offre combinée "${bookingWithPayments.offer.title}" du ${startDate} au ${endDate} a été créée avec succès. Le paiement a été enregistré. Elle est en attente de validation par le propriétaire.`;
      } else {
        message = `Votre réservation du ${startDate} au ${endDate} a été créée avec succès. Le paiement a été enregistré. Elle est en attente de validation par le propriétaire.`;
      }

      await this.notificationsService.createNotification(
        userId,
        title,
        message,
        NotificationType.INFO,
        bookingWithPayments.id,
      );
    } catch (error) {
      // Ne pas faire échouer la création de la réservation si l'envoi de notification échoue
      console.error('Erreur lors de l\'envoi de la notification de réservation:', error);
    }

    // Retourner la réservation formatée avec les paiements
    return this.formatBookingResponse(bookingWithPayments);
  }

  async findAll() {
    const bookings = await this.prisma.booking.findMany({
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        residence: {
          include: {
            reviews: {
              select: {
                id: true,
              },
            },
          },
        },
        vehicle: true,
        offer: true,
        payments: true,
        reviews: {
          select: {
            id: true,
          },
        },
      },
    });

    return bookings.map(booking => this.formatBookingResponse(booking));
  }

  async findOne(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        residence: {
          include: {
            reviews: {
              select: {
                id: true,
              },
            },
          },
        },
        vehicle: true,
        offer: true,
        payments: true,
        reviews: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Réservation non trouvée');
    }

    return this.formatBookingResponse(booking);
  }

  /**
   * Formate une réservation selon le format attendu par le frontend
   */
  private formatBookingResponse(booking: any) {
    // Récupérer les informations du propriétaire si c'est une résidence
    let ownerId = null;
    let ownerName = null;
    let ownerPhone = null;
    let ownerAddress = null;

    if (booking.residence) {
      // Pour l'instant, on utilise ownerId du modèle Residence si disponible
      // Sinon, on peut utiliser le premier admin ou un système de propriétaires
      ownerId = booking.residence.ownerId || null;
      ownerName = null; // À implémenter avec un modèle Owner
      ownerPhone = null;
      ownerAddress = booking.residence.address || null;
    }

    // Récupérer le reviewId si existe
    const reviewId = booking.reviews && booking.reviews.length > 0 
      ? booking.reviews[0].id 
      : null;

    // Mapper le statut vers le format frontend
    const statusMap: Record<string, string> = {
      'PENDING': 'confirmee',
      'CONFIRMED': 'confirmee',
      'CONFIRMEE': 'confirmee',
      'CHECKIN_CLIENT': 'checkinClient',
      'CHECKIN_PROPRIO': 'checkinProprio',
      'EN_COURS_SEJOUR': 'enCoursSejour',
      'COMPLETED': 'terminee',
      'TERMINEE': 'terminee',
      'CANCELLED': 'cancelled',
    };

    const frontendStatus = statusMap[booking.status] || booking.status.toLowerCase();
    const isCancelled = booking.status === 'CANCELLED';

    // Calculer les informations de paiement
    const payments = booking.payments || [];
    const completedPayments = payments.filter((p: any) => p.status === 'COMPLETED');
    const totalPaid = completedPayments.reduce((sum: number, p: any) => sum + p.amount, 0);
    const remainingBalance = booking.totalPrice - totalPaid;
    
    // L'acompte est le premier paiement complété, ou le montant total payé si c'est un paiement partiel
    const downPayment = completedPayments.length > 0 ? completedPayments[0].amount : 0;
    const isFullyPaid = totalPaid >= booking.totalPrice;
    
    // Déterminer le type de paiement effectué
    let paymentType: 'NONE' | 'DOWN_PAYMENT' | 'FULL_PAYMENT' = 'NONE';
    if (totalPaid > 0) {
      if (isFullyPaid || Math.abs(totalPaid - booking.totalPrice) < 0.01) {
        // Tolérance de 0.01 pour les erreurs d'arrondi
        paymentType = 'FULL_PAYMENT';
      } else {
        paymentType = 'DOWN_PAYMENT';
      }
    }

    return {
      id: booking.id,
      residenceId: booking.residenceId || null,
      residenceName: booking.residence?.title || null,
      residenceImage: Array.isArray(booking.residence?.images) && booking.residence.images.length > 0
        ? booking.residence.images[0]
        : null,
      clientId: booking.userId,
      ownerId,
      ownerName,
      ownerPhone,
      ownerAddress,
      checkInDate: booking.startDate,
      checkOutDate: booking.endDate,
      totalPrice: booking.totalPrice,
      status: frontendStatus,
      isCancelled,
      createdAt: booking.createdAt,
      keyRetrievedAt: booking.keyRetrievedAt || null,
      ownerConfirmedAt: booking.ownerConfirmedAt || null,
      checkOutAt: booking.checkOutAt || null,
      reviewId,
      // Informations de paiement
      payments: payments.map((p: any) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        method: p.method,
        transactionId: p.transactionId,
        createdAt: p.createdAt,
      })),
      downPayment, // Acompte (premier paiement complété)
      totalPaid, // Montant total payé
      remainingBalance, // Solde restant à payer
      isFullyPaid, // Indique si la réservation est entièrement payée
      paymentType, // Type de paiement: 'NONE' | 'DOWN_PAYMENT' | 'FULL_PAYMENT'
    };
  }

  async findByUser(userId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        residence: {
          include: {
            reviews: {
              select: {
                id: true,
              },
            },
          },
        },
        vehicle: true,
        offer: true,
        payments: true,
        reviews: {
          select: {
            id: true,
          },
        },
      },
    });

    return bookings.map(booking => this.formatBookingResponse(booking));
  }

  async update(id: string, updateBookingDto: UpdateBookingDto) {
    await this.findOne(id);

    const updated = await this.prisma.booking.update({
      where: { id },
      data: updateBookingDto,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        residence: true,
        vehicle: true,
        offer: true,
        payments: true,
        reviews: {
          select: {
            id: true,
          },
        },
      },
    });

    return this.formatBookingResponse(updated);
  }

  async remove(id: string) {
    // Vérifier que la réservation existe
    const booking = await this.findOne(id);

    // Supprimer d'abord les dépendances (payments et reviews) pour éviter les erreurs de contrainte
    // Utiliser une transaction pour garantir la cohérence
    return this.prisma.$transaction(async (tx) => {
      // Supprimer les paiements liés
      await tx.payment.deleteMany({
        where: { bookingId: id },
      });

      // Supprimer les avis liés
      await tx.review.deleteMany({
        where: { bookingId: id },
      });

      // Enfin, supprimer la réservation elle-même
      return tx.booking.delete({
        where: { id },
      });
    });
  }

  /**
   * Approuve une réservation (passe de PENDING à CONFIRMED)
   * Seul le propriétaire de la résidence/véhicule/offre ou un administrateur peut approuver
   */
  async approve(id: string) {
    // Récupérer la réservation directement depuis la base pour avoir le statut brut
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!booking) {
      throw new NotFoundException('Réservation non trouvée');
    }

    // Vérifier le statut brut (pas formaté)
    if (booking.status !== 'PENDING') {
      throw new BadRequestException(
        `Cette réservation ne peut pas être approuvée. Statut actuel: ${booking.status}. Seules les réservations en attente (PENDING) peuvent être approuvées.`
      );
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: 'CONFIRMEE',
        ownerConfirmedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        residence: true,
        vehicle: true,
        offer: true,
        payments: true,
        reviews: {
          select: {
            id: true,
          },
        },
      },
    });

    // Envoyer une notification au client
    try {
      let bookingTitle = 'Votre réservation';
      if (updated.residence?.title) {
        bookingTitle = updated.residence.title;
      } else if (updated.vehicle?.brand && updated.vehicle?.model) {
        bookingTitle = `${updated.vehicle.brand} ${updated.vehicle.model}`;
      } else if (updated.offer?.title) {
        bookingTitle = updated.offer.title;
      }
      
      await this.notificationsService.createNotification(
        updated.userId,
        'Réservation approuvée ✅',
        `Votre réservation pour "${bookingTitle}" a été approuvée par le propriétaire. Vous pouvez maintenant procéder au paiement.`,
        NotificationType.BOOKING_APPROVED,
        id,
      );
    } catch (error) {
      // Ne pas faire échouer l'approbation si l'envoi de notification échoue
      console.error('Erreur lors de l\'envoi de la notification:', error);
    }

    return this.formatBookingResponse(updated);
  }

  /**
   * Rejette une réservation (passe de PENDING à CANCELLED)
   * Seul le propriétaire de la résidence/véhicule/offre ou un administrateur peut rejeter
   */
  async reject(id: string, reason?: string) {
    // Récupérer la réservation directement depuis la base pour avoir le statut brut
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      select: { id: true, status: true, notes: true },
    });

    if (!booking) {
      throw new NotFoundException('Réservation non trouvée');
    }

    // Vérifier le statut brut (pas formaté)
    if (booking.status !== 'PENDING') {
      throw new BadRequestException(
        `Cette réservation ne peut pas être rejetée. Statut actuel: ${booking.status}. Seules les réservations en attente (PENDING) peuvent être rejetées.`
      );
    }

    // Récupérer les détails complets de la réservation pour la notification
    const bookingDetails = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        residence: true,
        vehicle: true,
        offer: true,
      },
    });

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        notes: reason ? `${booking.notes || ''}\n[Réservation rejetée: ${reason}]`.trim() : booking.notes,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        residence: true,
        vehicle: true,
        offer: true,
        payments: true,
        reviews: {
          select: {
            id: true,
          },
        },
      },
    });

    // Envoyer une notification au client
    if (bookingDetails) {
      try {
        let bookingTitle = 'Votre réservation';
        if (bookingDetails.residence?.title) {
          bookingTitle = bookingDetails.residence.title;
        } else if (bookingDetails.vehicle?.brand && bookingDetails.vehicle?.model) {
          bookingTitle = `${bookingDetails.vehicle.brand} ${bookingDetails.vehicle.model}`;
        } else if (bookingDetails.offer?.title) {
          bookingTitle = bookingDetails.offer.title;
        }
        
        const rejectionMessage = reason 
          ? `Votre réservation pour "${bookingTitle}" a été rejetée. Raison: ${reason}`
          : `Votre réservation pour "${bookingTitle}" a été rejetée par le propriétaire.`;
        
        await this.notificationsService.createNotification(
          bookingDetails.userId,
          'Réservation rejetée ❌',
          rejectionMessage,
          NotificationType.BOOKING_REJECTED,
          id,
        );
      } catch (error) {
        // Ne pas faire échouer le rejet si l'envoi de notification échoue
        console.error('Erreur lors de l\'envoi de la notification:', error);
      }
    }

    return this.formatBookingResponse(updated);
  }

  /**
   * Confirme la récupération de clé par le client (passe directement de CONFIRMEE à EN_COURS_SEJOUR)
   * Seul le client propriétaire de la réservation peut confirmer
   */
  async confirmKeyRetrieval(id: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      select: { id: true, status: true, userId: true, startDate: true },
    });

    if (!booking) {
      throw new NotFoundException('Réservation non trouvée');
    }

    if (booking.userId !== userId) {
      throw new BadRequestException('Vous ne pouvez confirmer que vos propres réservations');
    }

    // Vérifier que le statut est CONFIRMEE ou CONFIRMED
    if (booking.status === 'CANCELLED') {
      throw new BadRequestException({
        message: 'Cette action n\'est pas possible pour une réservation annulée.',
        code: 'BOOKING_CANCELLED',
        status: 'cancelled',
      });
    }
    if (booking.status !== 'CONFIRMEE' && booking.status !== 'CONFIRMED') {
      throw new BadRequestException(
        `Cette action n'est possible que pour les réservations confirmées. Statut actuel: ${booking.status}`
      );
    }

    // Vérifier que la date d'arrivée est passée
    const now = new Date();
    const startDate = new Date(booking.startDate);
    if (startDate > now) {
      throw new BadRequestException('Vous ne pouvez confirmer la récupération de clé qu\'à partir de la date d\'arrivée');
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: 'EN_COURS_SEJOUR',
        keyRetrievedAt: new Date(),
        ownerConfirmedAt: new Date(), // Confirmation automatique du propriétaire
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        residence: true,
        vehicle: true,
        offer: true,
        payments: true,
        reviews: {
          select: {
            id: true,
          },
        },
      },
    });

    // Envoyer une notification au propriétaire pour l'informer
    try {
      const ownerId = updated.residence?.ownerId || 
                     updated.vehicle?.ownerId || 
                     updated.offer?.ownerId;
      
      if (ownerId) {
        let bookingTitle = 'Réservation';
        if (updated.residence?.title) {
          bookingTitle = updated.residence.title;
        } else if (updated.vehicle?.brand && updated.vehicle?.model) {
          bookingTitle = `${updated.vehicle.brand} ${updated.vehicle.model}`;
        } else if (updated.offer?.title) {
          bookingTitle = updated.offer.title;
        }
        
        await this.notificationsService.createNotification(
          ownerId,
          'Séjour en cours 🏠',
          `Le client a confirmé avoir récupéré la clé pour "${bookingTitle}". Le séjour a commencé.`,
          NotificationType.INFO,
          id,
        );
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la notification:', error);
    }

    // Envoyer une notification au client
    try {
      let bookingTitle = 'Réservation';
      if (updated.residence?.title) {
        bookingTitle = updated.residence.title;
      } else if (updated.vehicle?.brand && updated.vehicle?.model) {
        bookingTitle = `${updated.vehicle.brand} ${updated.vehicle.model}`;
      } else if (updated.offer?.title) {
        bookingTitle = updated.offer.title;
      }
      
      await this.notificationsService.createNotification(
        updated.userId,
        'Séjour en cours 🏠',
        `Votre séjour pour "${bookingTitle}" a commencé. Profitez bien de votre séjour !`,
        NotificationType.SUCCESS,
        id,
      );
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la notification:', error);
    }

    return this.formatBookingResponse(updated);
  }

  /**
   * Confirme la remise de clé par le propriétaire (passe de CHECKIN_CLIENT à CHECKIN_PROPRIO)
   * Seul le propriétaire peut confirmer
   */
  async confirmOwnerKeyHandover(id: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        residence: { select: { ownerId: true } },
        vehicle: { select: { ownerId: true } },
        offer: { select: { ownerId: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException('Réservation non trouvée');
    }

    const ownerId = booking.residence?.ownerId || 
                   booking.vehicle?.ownerId || 
                   booking.offer?.ownerId;

    if (!ownerId || ownerId !== userId) {
      throw new BadRequestException('Seul le propriétaire peut confirmer la remise de clé');
    }

    if (booking.status !== 'CHECKIN_CLIENT') {
      throw new BadRequestException(
        `Cette action n'est possible que lorsque le client a confirmé la récupération de clé. Statut actuel: ${booking.status}`
      );
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: 'CHECKIN_PROPRIO',
        ownerConfirmedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        residence: true,
        vehicle: true,
        offer: true,
        payments: true,
        reviews: {
          select: {
            id: true,
          },
        },
      },
    });

    // Si les deux ont confirmé, passer automatiquement à EN_COURS_SEJOUR
    if (updated.keyRetrievedAt && updated.ownerConfirmedAt) {
      const finalUpdated = await this.prisma.booking.update({
        where: { id },
        data: {
          status: 'EN_COURS_SEJOUR',
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          residence: true,
          vehicle: true,
          offer: true,
          payments: true,
          reviews: {
            select: {
              id: true,
            },
          },
        },
      });

      // Envoyer une notification au client
      try {
        let bookingTitle = 'Réservation';
        if (finalUpdated.residence?.title) {
          bookingTitle = finalUpdated.residence.title;
        } else if (finalUpdated.vehicle?.brand && finalUpdated.vehicle?.model) {
          bookingTitle = `${finalUpdated.vehicle.brand} ${finalUpdated.vehicle.model}`;
        } else if (finalUpdated.offer?.title) {
          bookingTitle = finalUpdated.offer.title;
        }
        
        await this.notificationsService.createNotification(
          finalUpdated.userId,
          'Séjour en cours 🏠',
          `Votre séjour pour "${bookingTitle}" a commencé. Profitez bien de votre séjour !`,
          NotificationType.SUCCESS,
          id,
        );
      } catch (error) {
        console.error('Erreur lors de l\'envoi de la notification:', error);
      }

      return this.formatBookingResponse(finalUpdated);
    }

    // Envoyer une notification au client
    try {
      let bookingTitle = 'Réservation';
      if (updated.residence?.title) {
        bookingTitle = updated.residence.title;
      } else if (updated.vehicle?.brand && updated.vehicle?.model) {
        bookingTitle = `${updated.vehicle.brand} ${updated.vehicle.model}`;
      } else if (updated.offer?.title) {
        bookingTitle = updated.offer.title;
      }
      
      await this.notificationsService.createNotification(
        updated.userId,
        'Remise de clé confirmée 🔑',
        `Le propriétaire a confirmé la remise de clé pour "${bookingTitle}".`,
        NotificationType.INFO,
        id,
      );
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la notification:', error);
    }

    return this.formatBookingResponse(updated);
  }

  /**
   * Confirme le check-out par le client (passe de EN_COURS_SEJOUR à TERMINEE)
   * Seul le client propriétaire de la réservation peut confirmer
   */
  async confirmCheckOut(id: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      select: { id: true, status: true, userId: true },
    });

    if (!booking) {
      throw new NotFoundException('Réservation non trouvée');
    }

    if (booking.userId !== userId) {
      throw new BadRequestException('Vous ne pouvez confirmer que vos propres réservations');
    }

    if (booking.status !== 'EN_COURS_SEJOUR') {
      throw new BadRequestException(
        `Cette action n'est possible que pour les séjours en cours. Statut actuel: ${booking.status}`
      );
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: 'TERMINEE',
        checkOutAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        residence: true,
        vehicle: true,
        offer: true,
        payments: true,
        reviews: {
          select: {
            id: true,
          },
        },
      },
    });

    // Envoyer une notification au propriétaire
    try {
      const ownerId = updated.residence?.ownerId || 
                     updated.vehicle?.ownerId || 
                     updated.offer?.ownerId;
      
      if (ownerId) {
        let bookingTitle = 'Réservation';
        if (updated.residence?.title) {
          bookingTitle = updated.residence.title;
        } else if (updated.vehicle?.brand && updated.vehicle?.model) {
          bookingTitle = `${updated.vehicle.brand} ${updated.vehicle.model}`;
        } else if (updated.offer?.title) {
          bookingTitle = updated.offer.title;
        }
        
        await this.notificationsService.createNotification(
          ownerId,
          'Check-out effectué ✅',
          `Le client a quitté la résidence pour "${bookingTitle}".`,
          NotificationType.INFO,
          id,
        );
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la notification:', error);
    }

    return this.formatBookingResponse(updated);
  }
}
