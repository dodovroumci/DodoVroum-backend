import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as fs from 'fs';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (admin.apps.length > 0) return;

    const credentialsPath = this.config.get<string>('FIREBASE_CREDENTIALS_PATH');
    if (!credentialsPath) {
      this.logger.warn('FIREBASE_CREDENTIALS_PATH non défini — push notifications désactivées');
      return;
    }

    const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    this.logger.log('Firebase Admin SDK initialisé');
  }

  async sendPushNotification(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (admin.apps.length === 0) return;

    try {
      await admin.messaging().send({ token, notification: { title, body }, data });
      this.logger.log(`Push envoyé → ${token.slice(0, 20)}…`);
    } catch (error) {
      this.logger.error(`Échec push → ${token.slice(0, 20)}… : ${error.message}`);
    }
  }

  async sendPushToMany(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (admin.apps.length === 0 || tokens.length === 0) return;

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data,
    });
    this.logger.log(`Push multicast : ${response.successCount}/${tokens.length} réussis`);
  }
}
