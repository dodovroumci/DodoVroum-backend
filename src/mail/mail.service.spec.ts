import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer');
const createTransport = nodemailer.createTransport as jest.Mock;

describe('MailService — email de réinitialisation', () => {
  const token = 'c0ffee'.repeat(10) + 'beef'; // 64 caractères hex
  const resetUrl = `https://dodovroum.com/reset-password#token=${token}`;
  let sendMail: jest.Mock;

  const service = (env: Record<string, string | undefined>) =>
    new MailService({ get: (key: string) => env[key] } as any);

  const smtpEnv = {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'mailer',
    SMTP_PASS: 'secret',
    MAIL_FROM: 'DodoVroum <no-reply@dodovroum.com>',
  };

  const sendReset = (env: Record<string, string | undefined> = smtpEnv, firstName: string | null = 'Awa') =>
    service(env).sendPasswordResetEmail({ to: 'awa@test.ci', firstName, resetUrl, expiresInMinutes: 30 });

  const sent = () => sendMail.mock.calls[0][0];
  const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({});
    createTransport.mockReset().mockReturnValue({ sendMail });
  });

  it('destinataire, expéditeur et sujet corrects', async () => {
    await sendReset();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchObject({
      to: 'awa@test.ci',
      from: 'DodoVroum <no-reply@dodovroum.com>',
      subject: 'Réinitialisation de votre mot de passe DodoVroum',
    });
  });

  it('le HTML contient le lien #token= et le bouton', async () => {
    await sendReset();
    const { html } = sent();
    expect(html).toContain(`href="${resetUrl}"`);
    expect(html).toContain('#token=');
    expect(html).toContain('Réinitialiser mon mot de passe');
    expect(html).toContain('expire dans 30 minutes');
    expect(html).toContain("Si vous n'êtes pas à l'origine de cette demande");
  });

  it('le token n\'apparaît dans le HTML que dans le lien', async () => {
    await sendReset();
    const { html, text } = sent();
    expect(occurrences(html, token)).toBe(1);
    expect(html.indexOf(token)).toBe(html.indexOf(`href="${resetUrl}"`) + 'href="'.length + resetUrl.indexOf(token));
    // Version texte : uniquement le lien complet (indispensable sans HTML).
    expect(occurrences(text, token)).toBe(1);
    expect(text).toContain(resetUrl);
  });

  it('aucune donnée sensible inutile (ni mot de passe, ni adresse, ni identifiant)', async () => {
    await sendReset();
    const { html, text } = sent();
    for (const content of [html, text]) {
      expect(content).not.toContain('awa@test.ci');
      expect(content.toLowerCase()).not.toContain('mot de passe :');
      expect(content).not.toContain('user-');
    }
  });

  it('prénom échappé (pas d\'injection HTML)', async () => {
    await sendReset(smtpEnv, '<script>alert(1)</script>');
    const { html } = sent();
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('sans prénom : salutation neutre', async () => {
    await sendReset(smtpEnv, null);
    expect(sent().html).toContain('Bonjour,');
  });

  it('configuration SMTP : 587 → STARTTLS, 465 → TLS, SMTP_SECURE prioritaire', async () => {
    await sendReset();
    expect(createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({ host: 'smtp.example.com', port: 587, secure: false, auth: { user: 'mailer', pass: 'secret' } }),
    );
    await sendReset({ ...smtpEnv, SMTP_PORT: '465' });
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ port: 465, secure: true }));
    await sendReset({ ...smtpEnv, SMTP_SECURE: 'true' });
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ port: 587, secure: true }));
  });

  it('sans SMTP_HOST : aucun envoi, aucune erreur', async () => {
    await expect(sendReset({ ...smtpEnv, SMTP_HOST: undefined })).resolves.toBeUndefined();
    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('email de bienvenue propriétaire inchangé : toujours non envoyé', async () => {
    await service(smtpEnv).sendOwnerWelcomeEmail({ to: 'owner@test.ci', firstName: 'Kouassi' });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
