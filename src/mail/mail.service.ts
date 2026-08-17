import { Injectable, Logger } from '@nestjs/common';

export interface OwnerWelcomeEmailPayload {
  to: string;
  firstName: string;
}

/**
 * Point d'intégration email unique de l'application. Aucun provider n'est
 * branché à ce stade (décision produit : l'inscription propriétaire ne doit
 * jamais être bloquée par l'envoi d'un email) — cette implémentation logue
 * uniquement. Remplacer le corps de chaque méthode par un vrai envoi
 * (nodemailer/SMTP, Resend, SendGrid...) sans changer la signature, pour ne
 * pas impacter les appelants.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendOwnerWelcomeEmail(payload: OwnerWelcomeEmailPayload): Promise<void> {
    // TODO: brancher un vrai provider d'envoi (SMTP/Resend/SendGrid) — voir MailService docblock.
    this.logger.log(`[MAIL_STUB] Bienvenue propriétaire non envoyé (pas de provider configuré) — to=${payload.to}`);
  }
}
