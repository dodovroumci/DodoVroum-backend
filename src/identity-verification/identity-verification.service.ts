import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SubmitIdentityVerificationDto } from './dto/submit-identity-verification.dto';
import { UpdateVerificationStatusDto } from './dto/update-verification-status.dto';
import { VerificationStatus, UserRole } from '@prisma/client';

@Injectable()
export class IdentityVerificationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Soumettre une demande de vérification d'identité
   */
  async submitVerification(
    userId: string,
    submitDto: SubmitIdentityVerificationDto,
  ) {
    // Vérifier que l'utilisateur existe et est un propriétaire
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (user.role !== UserRole.PROPRIETAIRE) {
      throw new ForbiddenException('Seuls les propriétaires peuvent soumettre une vérification d\'identité');
    }

    // Vérifier si une vérification existe déjà
    const existing = await this.prisma.identityVerification.findUnique({
      where: { userId },
    });

    if (existing) {
      // Si déjà vérifié, on ne peut pas modifier
      if (existing.verificationStatus === VerificationStatus.VERIFIED) {
        throw new BadRequestException('Votre identité a déjà été vérifiée');
      }
      // Sinon, on met à jour
      return this.prisma.identityVerification.update({
        where: { userId },
        data: {
          identityNumber: submitDto.identityNumber,
          identityType: submitDto.identityType,
          identityPhotoFront: submitDto.identityPhotoFront,
          identityPhotoBack: submitDto.identityPhotoBack,
          identityPhotoExtra: submitDto.identityPhotoExtra,
          verificationStatus: VerificationStatus.PENDING,
          submittedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });
    }

    // Créer une nouvelle vérification
    return this.prisma.identityVerification.create({
      data: {
        userId,
        identityNumber: submitDto.identityNumber,
        identityType: submitDto.identityType,
        identityPhotoFront: submitDto.identityPhotoFront,
        identityPhotoBack: submitDto.identityPhotoBack,
        identityPhotoExtra: submitDto.identityPhotoExtra,
        verificationStatus: VerificationStatus.PENDING,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });
  }

  /**
   * Obtenir le statut de vérification d'un utilisateur
   */
  async getVerificationStatus(userId: string) {
    const verification = await this.prisma.identityVerification.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isVerified: true,
          },
        },
      },
    });

    if (!verification) {
      return null;
    }

    return verification;
  }

  /**
   * Obtenir toutes les vérifications en attente (pour les admins)
   */
  async getPendingVerifications() {
    return this.prisma.identityVerification.findMany({
      where: {
        verificationStatus: VerificationStatus.PENDING,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        submittedAt: 'asc',
      },
    });
  }

  /**
   * Mettre à jour le statut de vérification (admin uniquement)
   */
  async updateVerificationStatus(
    verificationId: string,
    adminId: string,
    updateDto: UpdateVerificationStatusDto,
  ) {
    const verification = await this.prisma.identityVerification.findUnique({
      where: { id: verificationId },
      include: { user: true },
    });

    if (!verification) {
      throw new NotFoundException('Vérification d\'identité non trouvée');
    }

    const updateData: any = {
      verificationStatus: updateDto.verificationStatus,
      verifiedBy: adminId,
      updatedAt: new Date(),
    };

    if (updateDto.verificationStatus === VerificationStatus.VERIFIED) {
      updateData.verifiedAt = new Date();
      // Mettre à jour le statut isVerified de l'utilisateur
      await this.prisma.user.update({
        where: { id: verification.userId },
        data: { isVerified: true },
      });
    } else if (updateDto.verificationStatus === VerificationStatus.REJECTED) {
      if (!updateDto.rejectionReason) {
        throw new BadRequestException('Une raison de rejet est requise');
      }
      updateData.rejectionReason = updateDto.rejectionReason;
      // Retirer le statut vérifié de l'utilisateur
      await this.prisma.user.update({
        where: { id: verification.userId },
        data: { isVerified: false },
      });
    }

    return this.prisma.identityVerification.update({
      where: { id: verificationId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isVerified: true,
          },
        },
      },
    });
  }

  /**
   * Mettre à jour le statut de vérification par userId (admin uniquement)
   */
  async updateVerificationStatusByUserId(
    userId: string,
    adminId: string,
    updateDto: UpdateVerificationStatusDto,
  ) {
    const verification = await this.prisma.identityVerification.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!verification) {
      throw new NotFoundException('Vérification d\'identité non trouvée pour cet utilisateur');
    }

    const updateData: any = {
      verificationStatus: updateDto.verificationStatus,
      verifiedBy: adminId,
      updatedAt: new Date(),
    };

    if (updateDto.verificationStatus === VerificationStatus.VERIFIED) {
      updateData.verifiedAt = new Date();
      // Mettre à jour le statut isVerified de l'utilisateur
      await this.prisma.user.update({
        where: { id: userId },
        data: { isVerified: true },
      });
    } else if (updateDto.verificationStatus === VerificationStatus.REJECTED) {
      if (!updateDto.rejectionReason) {
        throw new BadRequestException('Une raison de rejet est requise');
      }
      updateData.rejectionReason = updateDto.rejectionReason;
      // Retirer le statut vérifié de l'utilisateur
      await this.prisma.user.update({
        where: { id: userId },
        data: { isVerified: false },
      });
    }

    return this.prisma.identityVerification.update({
      where: { userId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isVerified: true,
          },
        },
      },
    });
  }

  /**
   * Obtenir toutes les vérifications (admin uniquement)
   */
  async getAllVerifications(status?: VerificationStatus) {
    const where: any = {};
    if (status) {
      where.verificationStatus = status;
    }

    return this.prisma.identityVerification.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            isVerified: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        submittedAt: 'desc',
      },
    });
  }
}

