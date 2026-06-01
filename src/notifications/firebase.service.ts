import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import { PrismaService } from '../common/prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

const STALE_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private initialized = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    if (admin.apps.length > 0) {
      this.initialized = true;
      return;
    }

    const credentialsPath = this.config.get<string>('FIREBASE_CREDENTIALS_PATH');
    if (!credentialsPath) {
      this.logger.warn('FIREBASE_CREDENTIALS_PATH non défini — push notifications désactivées');
      return;
    }

    try {
      const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      this.initialized = true;
      this.logger.log('Firebase Admin SDK initialisé');
    } catch (error: any) {
      this.logger.error(`Impossible d'initialiser Firebase : ${error.message}`);
    }
  }

  /**
   * Envoie une notification à tous les appareils d'un utilisateur.
   * Supprime automatiquement les tokens obsolètes signalés par Firebase.
   */
  async sendNotification(userId: string, payload: PushPayload): Promise<void> {
    if (!this.initialized) return;

    const devices = await this.prisma.userDevice.findMany({
      where: { userId },
      select: { id: true, token: true },
    });

    if (devices.length === 0) return;

    const tokens = devices.map((d) => d.token);
    let response: admin.messaging.BatchResponse;

    try {
      response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        ...(payload.data ? { data: payload.data } : {}),
      });
    } catch (error: any) {
      this.logger.error(`[FCM_ERROR] Multicast userId=${userId} : ${error.message}`);
      return;
    }

    this.logger.log(`[FCM] userId=${userId} — ${response.successCount}/${tokens.length} réussis`);

    const staleIds = response.responses
      .map((r, i) => ({ ...r, deviceId: devices[i].id }))
      .filter((r) => !r.success && r.error && STALE_TOKEN_ERRORS.has(r.error.code))
      .map((r) => r.deviceId);

    if (staleIds.length > 0) {
      await this.prisma.userDevice.deleteMany({ where: { id: { in: staleIds } } });
      this.logger.log(`[FCM_CLEANUP] ${staleIds.length} token(s) supprimé(s) pour userId=${userId}`);
    }
  }

  async sendPushNotification(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.initialized) return;

    try {
      await admin.messaging().send({ token, notification: { title, body }, data });
      this.logger.log(`[FCM] Push → ${token.slice(0, 20)}…`);
    } catch (error: any) {
      this.logger.error(`[FCM_ERROR] Push échoué → ${token.slice(0, 20)}… : ${error.message}`);
    }
  }

  async sendPushToMany(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.initialized || tokens.length === 0) return;

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      ...(data ? { data } : {}),
    });
    this.logger.log(`[FCM] Multicast : ${response.successCount}/${tokens.length} réussis`);
  }
}
