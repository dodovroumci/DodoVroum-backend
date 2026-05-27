/**
 * @file offer-expiration.service.ts
 * @description Cron job qui marque automatiquement les offres expirées (validTo < now)
 *              comme inactives en base. Calqué sur BookingCleanupService.
 *
 * Résultat :
 *   - L'index @@index([isActive]) reste pertinent pour les requêtes publiques.
 *   - La contrainte d'unicité résidence/véhicule par offre active est respectée
 *     dès que l'offre expire, sans attendre une action manuelle.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class OfferExpirationService {
  private readonly logger = new Logger(OfferExpirationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Toutes les heures : désactive les offres dont validTo est dépassé.
   * Le cron horaire est suffisant — une offre n'expire pas à la seconde près.
   * Le filtre query-time dans activeOfferWhere() garantit la cohérence immédiate
   * entre deux passages du cron.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiration(): Promise<void> {
    const now = new Date();

    try {
      const { count } = await this.prisma.offer.updateMany({
        where: {
          isActive: true,
          validTo: { lt: now },
        },
        data: { isActive: false },
      });

      if (count > 0) {
        this.logger.log(`⏰ ${count} offre(s) expirée(s) désactivée(s) automatiquement.`);
      }
    } catch (error) {
      const stack = error instanceof Error ? error.stack : String(error);
      this.logger.error('❌ Échec du cleanup des offres expirées', stack);
    }
  }

  /**
   * Méthode appelable manuellement (ex: au démarrage ou dans des tests).
   */
  async expireNow(): Promise<number> {
    const { count } = await this.prisma.offer.updateMany({
      where: {
        isActive: true,
        validTo: { lt: new Date() },
      },
      data: { isActive: false },
    });
    return count;
  }
}
