import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from './soft-delete.extension';

// ─── Typage du client étendu ───────────────────────────────────────────────
// ReturnType capture toutes les méthodes custom (softDelete, findUnique surchargé)
// et les filtres automatiques de l'extension.
const createExtendedClient = (base: PrismaClient) => base.$extends(softDeleteExtension);
type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>;

/**
 * Type du `tx` reçu dans les callbacks de $transaction.
 * À utiliser à la place de Prisma.TransactionClient dans tous les services
 * qui reçoivent une transaction de PrismaService.
 */
export type PrismaTxClient = Omit<
  ExtendedPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// ─── Service ──────────────────────────────────────────────────────────────
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  /**
   * Client brut sans aucune extension.
   * Réservé au bypass admin (lecture des enregistrements soft-deleted).
   * Ne jamais l'injecter dans les services métier.
   */
  readonly $raw: PrismaClient;

  private readonly _ext: ExtendedPrismaClient;

  constructor() {
    this.$raw = new PrismaClient();
    this._ext = createExtendedClient(this.$raw);
  }

  async onModuleInit() {
    await this.$raw.$connect();
  }

  async onModuleDestroy() {
    await this.$raw.$disconnect();
  }

  // ── Modèles soft-deleted (méthodes custom disponibles) ──────────────────

  get residence(): ExtendedPrismaClient['residence'] {
    return this._ext.residence;
  }

  get vehicle(): ExtendedPrismaClient['vehicle'] {
    return this._ext.vehicle;
  }

  get booking(): ExtendedPrismaClient['booking'] {
    return this._ext.booking;
  }

  get user(): ExtendedPrismaClient['user'] {
    return this._ext.user;
  }

  // ── Modèles standard (pas de soft-delete) ───────────────────────────────

  get offer(): PrismaClient['offer'] {
    return this.$raw.offer;
  }

  get payment(): PrismaClient['payment'] {
    return this.$raw.payment;
  }

  get review(): PrismaClient['review'] {
    return this.$raw.review;
  }

  get favorite(): PrismaClient['favorite'] {
    return this.$raw.favorite;
  }

  get blockedDate(): PrismaClient['blockedDate'] {
    return this.$raw.blockedDate;
  }

  get notification(): PrismaClient['notification'] {
    return this.$raw.notification;
  }

  get identityVerification(): PrismaClient['identityVerification'] {
    return this.$raw.identityVerification;
  }

  get userDevice(): PrismaClient['userDevice'] {
    return this.$raw.userDevice;
  }

  // ── Transactions & raw queries ───────────────────────────────────────────

  get $transaction(): ExtendedPrismaClient['$transaction'] {
    return this._ext.$transaction.bind(this._ext);
  }

  get $queryRaw(): ExtendedPrismaClient['$queryRaw'] {
    return this._ext.$queryRaw.bind(this._ext);
  }

  get $executeRaw(): ExtendedPrismaClient['$executeRaw'] {
    return this._ext.$executeRaw.bind(this._ext);
  }
}
