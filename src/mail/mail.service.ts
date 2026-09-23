import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface OwnerWelcomeEmailPayload {
  to: string;
  firstName: string;
}

export interface PasswordResetEmailPayload {
  to: string;
  firstName?: string | null;
  /** Lien complet `https://…/reset-password#token=…` (le token n'est jamais affiché seul). */
  resetUrl: string;
  expiresInMinutes: number;
}

interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const BRAND_BLUE = '#12809B';
const BRAND_DARK = '#222B45';
const LOGO_URL = 'https://dodovroum.com/images/logo.png';

/**
 * Point d'intégration email unique de l'application, via SMTP (Nodemailer,
 * variables SMTP_*). Sans SMTP_HOST, les envois sont seulement journalisés
 * (développement). Les appelants ne dépendent que des méthodes métier.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {}

  async sendOwnerWelcomeEmail(payload: OwnerWelcomeEmailPayload): Promise<void> {
    // Décision produit : l'inscription propriétaire ne doit jamais être bloquée par
    // un email, et ce message n'est pas encore envoyé. Pour l'activer : this.send(...).
    this.logger.log(`[MAIL_STUB] Bienvenue propriétaire non envoyé (pas de provider configuré) — to=${payload.to}`);
  }

  async sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
    const greeting = payload.firstName?.trim()
      ? `Bonjour ${escapeHtml(payload.firstName.trim())},`
      : 'Bonjour,';
    const textGreeting = payload.firstName?.trim() ? `Bonjour ${payload.firstName.trim()},` : 'Bonjour,';
    const href = escapeHtml(payload.resetUrl);
    const minutes = payload.expiresInMinutes;

    const html = `<!DOCTYPE html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#F4F6F9;font-family:Arial,Helvetica,sans-serif;color:${BRAND_DARK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;padding:32px;">
          <tr><td align="center" style="padding-bottom:24px;">
            <img src="${LOGO_URL}" alt="DodoVroum" width="120" style="display:block;border:0;">
          </td></tr>
          <tr><td style="font-size:16px;line-height:1.6;">
            <p style="margin:0 0 16px;">${greeting}</p>
            <p style="margin:0 0 16px;">Nous avons reçu une demande de réinitialisation du mot de passe de votre compte DodoVroum.</p>
            <p style="margin:0 0 24px;">Pour choisir un nouveau mot de passe, cliquez sur le bouton ci-dessous.</p>
          </td></tr>
          <tr><td align="center" style="padding-bottom:24px;">
            <a href="${href}" style="display:inline-block;background:${BRAND_BLUE};color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:12px;">Réinitialiser mon mot de passe</a>
          </td></tr>
          <tr><td style="font-size:14px;line-height:1.6;color:#6B7280;">
            <p style="margin:0 0 12px;">Ce lien expire dans ${minutes} minutes et ne peut être utilisé qu'une seule fois.</p>
            <p style="margin:0;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email : votre mot de passe reste inchangé.</p>
          </td></tr>
        </table>
        <p style="font-size:12px;color:#9CA3AF;margin-top:16px;">DodoVroum — Résidences et véhicules à Abidjan</p>
      </td></tr>
    </table>
  </body>
</html>`;

    // Version texte (clients sans HTML) : le lien doit y figurer pour rester utilisable.
    const text = [
      textGreeting,
      '',
      'Nous avons reçu une demande de réinitialisation du mot de passe de votre compte DodoVroum.',
      'Pour choisir un nouveau mot de passe, ouvrez ce lien :',
      payload.resetUrl,
      '',
      `Ce lien expire dans ${minutes} minutes et ne peut être utilisé qu'une seule fois.`,
      "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email : votre mot de passe reste inchangé.",
    ].join('\n');

    await this.send({
      to: payload.to,
      subject: 'Réinitialisation de votre mot de passe DodoVroum',
      html,
      text,
    });
  }

  private async send(mail: OutgoingMail): Promise<void> {
    const transporter = this.getTransporter();
    if (!transporter) {
      // Ni destinataire ni contenu journalisés : le contenu peut contenir un lien sensible.
      this.logger.warn(`[MAIL_STUB] SMTP non configuré — email « ${mail.subject} » non envoyé`);
      return;
    }
    await transporter.sendMail({
      from: this.config.get<string>('MAIL_FROM') || 'DodoVroum <no-reply@dodovroum.com>',
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  }

  private getTransporter(): nodemailer.Transporter | undefined {
    if (this.transporter) return this.transporter;
    const host = this.config.get<string>('SMTP_HOST');
    if (!host) return undefined;

    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const secureRaw = this.config.get<string>('SMTP_SECURE');
    // 465 = TLS implicite ; 587 = STARTTLS (secure: false).
    const secure = secureRaw !== undefined ? String(secureRaw).toLowerCase() === 'true' : port === 465;
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
    });
    return this.transporter;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
