import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Crée une notification pour un utilisateur
   */
  async createNotification(
    userId: string,
    title: string,
    message: string,
    type: NotificationType = NotificationType.INFO,
    bookingId?: string,
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        bookingId,
      },
    });
  }

  /**
   * Récupère toutes les notifications d'un utilisateur
   */
  async getUserNotifications(userId: string, isRead?: boolean) {
    const where: any = { userId };
    if (isRead !== undefined) {
      where.isRead = isRead;
    }

    return this.prisma.notification.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Récupère les notifications non lues d'un utilisateur
   */
  async getUnreadNotifications(userId: string) {
    return this.getUserNotifications(userId, false);
  }

  /**
   * Marque une notification comme lue
   */
  async markAsRead(notificationId: string, userId: string) {
    // Vérifier que la notification appartient à l'utilisateur
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true },
    });

    if (!notification) {
      throw new NotFoundException('Notification non trouvée');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Vous n\'avez pas accès à cette notification');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Marque toutes les notifications d'un utilisateur comme lues
   */
  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Compte les notifications non lues d'un utilisateur
   */
  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  /**
   * Supprime une notification
   */
  async deleteNotification(notificationId: string, userId: string) {
    // Vérifier que la notification appartient à l'utilisateur
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true },
    });

    if (!notification) {
      throw new NotFoundException('Notification non trouvée');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Vous n\'avez pas accès à cette notification');
    }

    return this.prisma.notification.delete({
      where: { id: notificationId },
    });
  }
}

