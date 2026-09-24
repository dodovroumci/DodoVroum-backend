import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PaymentsService } from './payments.service';

/**
 * Sécurité des routes de paiement, au niveau HTTP : vrais guards (AdminGuard,
 * guards GeniusPay) et même ValidationPipe que main.ts. Seule l'authentification
 * JWT est simulée (rôle passé dans l'en-tête `x-test-role`).
 */
class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const role = req.headers['x-test-role'];
    if (role) req.user = { id: `${String(role).toLowerCase()}-1`, role };
    return true;
  }
}

describe('Routes de paiement — sécurité HTTP', () => {
  let app: INestApplication;
  const service = {
    create: jest.fn(async (dto: any) => ({ id: 'pay-1', ...dto, status: 'PENDING' })),
    update: jest.fn(async (id: string, dto: any) => ({ id, ...dto })),
    validatePayment: jest.fn(),
  };

  const validBody = { amount: 30000, method: 'MOBILE_MONEY', bookingId: 'bk-1' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentsController, PaymentsWebhookController],
      providers: [
        { provide: PaymentsService, useValue: service },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                GENIUSPAY_WEBHOOK_SECRET: 'whsec_test',
                GENIUSPAY_WEBHOOK_ALLOWED_IPS: '203.0.113.10',
              })[key],
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeJwtGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  const post = (role: string | null, body: Record<string, unknown>) => {
    const req = request(app.getHttpServer()).post('/payments');
    return (role ? req.set('x-test-role', role) : req).send(body);
  };

  describe('POST /payments', () => {
    it.each([UserRole.CLIENT, UserRole.PROPRIETAIRE])('utilisateur %s : refusé (403), aucun Payment créé', async (role) => {
      const attempts = [
        validBody,
        { ...validBody, status: 'COMPLETED' },
        { ...validBody, amount: 1 }, // montant arbitraire
        { ...validBody, paidAt: '2026-09-24T00:00:00.000Z' },
        { ...validBody, transactionId: 'MTX-VOLE' },
        { ...validBody, webhookEventId: 'MTX-VOLE' },
        { ...validBody, refundRequiredAt: null },
      ];
      for (const body of attempts) {
        await post(role, body).expect(403);
      }
      expect(service.create).not.toHaveBeenCalled();
    });

    it('admin : création acceptée, sans aucun champ de statut transmis au service', async () => {
      await post(UserRole.ADMIN, validBody).expect(201);
      expect(service.create).toHaveBeenCalledTimes(1);
      expect(service.create.mock.calls[0][0]).toEqual(validBody);
    });

    it.each([
      ['status', { status: 'COMPLETED' }],
      ['paidAt', { paidAt: '2026-09-24T00:00:00.000Z' }],
      ['transactionId', { transactionId: 'MTX-VOLE' }],
      ['webhookEventId', { webhookEventId: 'MTX-VOLE' }],
      ['refundRequiredAt', { refundRequiredAt: null }],
      ['paymentOption', { paymentOption: 'DOWN_PAYMENT' }],
    ])('admin : champ « %s » refusé (400) à la création', async (_field, extra) => {
      await post(UserRole.ADMIN, { ...validBody, ...extra }).expect(400);
      expect(service.create).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /payments/:id', () => {
    it('utilisateur normal : refusé (403)', async () => {
      await request(app.getHttpServer())
        .patch('/payments/pay-1')
        .set('x-test-role', UserRole.CLIENT)
        .send({ status: 'COMPLETED' })
        .expect(403);
      expect(service.update).not.toHaveBeenCalled();
    });

    it('admin : paidAt jamais accepté dans le payload (400)', async () => {
      await request(app.getHttpServer())
        .patch('/payments/pay-1')
        .set('x-test-role', UserRole.ADMIN)
        .send({ status: 'COMPLETED', paidAt: '2020-01-01T00:00:00.000Z' })
        .expect(400);
      expect(service.update).not.toHaveBeenCalled();
    });
  });

  describe('POST /payments/geniuspay (webhook)', () => {
    it('un utilisateur connecté sans IP autorisée ni signature ne peut pas valider un paiement', async () => {
      const res = await request(app.getHttpServer())
        .post('/payments/geniuspay')
        .set('x-test-role', UserRole.CLIENT)
        .send({ event: 'payment.success', data: { reference: 'MTX-1', amount: 200 } });

      expect([401, 403]).toContain(res.status);
      expect(service.validatePayment).not.toHaveBeenCalled();
    });
  });
});
