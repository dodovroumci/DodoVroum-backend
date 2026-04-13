import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SubmitIdentityVerificationDto } from './dto/submit-identity-verification.dto';
import { UpdateVerificationStatusDto } from './dto/update-verification-status.dto';
import { VerificationStatus, UserRole, IdentityType } from '@prisma/client';

@Injectable()
export class IdentityVerificationService {
  constructor(private prisma: PrismaService) {}

  async submitVerification(userId: string, submitDto: SubmitIdentityVerificationDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    if (user.role !== UserRole.PROPRIETAIRE) {
      throw new ForbiddenException('Seuls les propriétaires peuvent soumettre une vérification');
    }

    const existing = await this.prisma.identityVerification.findUnique({ where: { userId } });
    if (existing && existing.verificationStatus === VerificationStatus.VERIFIED) {
      throw new BadRequestException('Votre identité a déjà été vérifiée');
    }

    const data = {
      identityNumber: submitDto.identityNumber,
      identityType: submitDto.identityType,
      identityPhotoFront: submitDto.identityPhotoFront,
      identityPhotoBack: submitDto.identityPhotoBack,
      identityPhotoExtra: submitDto.identityPhotoExtra,
      verificationStatus: VerificationStatus.PENDING,
      submittedAt: new Date(),
    };

    return this.prisma.identityVerification.upsert({
      where: { userId },
      update: data,
      create: { ...data, userId },
      include: { user: true }
    });
  }

  async getVerificationStatus(userId: string) {
    return this.prisma.identityVerification.findUnique({
      where: { userId },
      include: { user: true },
    });
  }

  /**
   * Version finale avec Auto-Healing pour l'Admin
   */
  async updateVerificationStatusByUserId(
    userId: string,
    adminId: string,
    updateDto: UpdateVerificationStatusDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identityVerification: true },
    });

    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    // Création si manquante (Auto-healing)
    if (!user.identityVerification) {
      await this.prisma.identityVerification.create({
        data: {
          userId: userId,
          identityType: (user.identityType as IdentityType) || IdentityType.CNI, // Cast strict
          identityNumber: user.identityNumber || 'PENDING',
          identityPhotoFront: user.identityPhotoFront || '',
          identityPhotoBack: user.identityPhotoBack || '',
          identityPhotoExtra: user.identityPhotoExtra || '',
          verificationStatus: VerificationStatus.PENDING,
        },
      });
    }

    const updateData: any = {
      verificationStatus: updateDto.verificationStatus,
      verifiedBy: adminId,
      updatedAt: new Date(),
    };

    if (updateDto.verificationStatus === VerificationStatus.VERIFIED) {
      updateData.verifiedAt = new Date();
      await this.prisma.user.update({ where: { id: userId }, data: { isVerified: true } });
    } else if (updateDto.verificationStatus === VerificationStatus.REJECTED) {
      if (!updateDto.rejectionReason) throw new BadRequestException('Raison requise');
      updateData.rejectionReason = updateDto.rejectionReason;
      await this.prisma.user.update({ where: { id: userId }, data: { isVerified: false } });
    }

    return this.prisma.identityVerification.update({
      where: { userId },
      data: updateData,
      include: { user: true },
    });
  }

  async getPendingVerifications() {
    return this.prisma.identityVerification.findMany({
      where: { verificationStatus: VerificationStatus.PENDING },
      include: { user: true },
      orderBy: { submittedAt: 'asc' },
    });
  }
}
