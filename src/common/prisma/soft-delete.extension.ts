import { Prisma } from '@prisma/client';

// ─── Helpers ───────────────────────────────────────────────────────────────

function withDeletedAt<T extends { where?: Record<string, unknown> }>(args: T): T {
  return { ...args, where: { ...args?.where, deletedAt: null } };
}

// ─── Extension ─────────────────────────────────────────────────────────────

export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',

  // ── 1. Méthodes personnalisées sur les modèles ──────────────────────────
  model: {
    residence: {
      /**
       * Suppression logique. Utiliser à la place de prisma.residence.delete().
       */
      async softDelete(id: string) {
        const ctx = Prisma.getExtensionContext(this);
        return (ctx as any).update({ where: { id }, data: { deletedAt: new Date() } });
      },

      /**
       * findUnique redirigé vers findFirst pour pouvoir injecter deletedAt: null.
       * findUnique n'accepte que des champs uniques dans where — on contourne cette
       * limite en déléguant à findFirst qui, lui, est intercepté par le query filter.
       */
      async findUnique<T extends Prisma.ResidenceFindUniqueArgs>(args: T) {
        const ctx = Prisma.getExtensionContext(this);
        return (ctx as any).findFirst({ ...args, where: { ...args.where, deletedAt: null } });
      },

      /**
       * Bypass admin : récupère tous les enregistrements y compris soft-deleted.
       * Nécessite de passer le rawClient depuis le service admin.
       * Voir PrismaService.$raw
       */
    },

    vehicle: {
      async softDelete(id: string) {
        const ctx = Prisma.getExtensionContext(this);
        return (ctx as any).update({ where: { id }, data: { deletedAt: new Date() } });
      },

      async findUnique<T extends Prisma.VehicleFindUniqueArgs>(args: T) {
        const ctx = Prisma.getExtensionContext(this);
        return (ctx as any).findFirst({ ...args, where: { ...args.where, deletedAt: null } });
      },
    },

    booking: {
      async softDelete(id: string) {
        const ctx = Prisma.getExtensionContext(this);
        return (ctx as any).update({ where: { id }, data: { deletedAt: new Date() } });
      },

      async findUnique<T extends Prisma.BookingFindUniqueArgs>(args: T) {
        const ctx = Prisma.getExtensionContext(this);
        return (ctx as any).findFirst({ ...args, where: { ...args.where, deletedAt: null } });
      },
    },
  },

  // ── 2. Filtrage automatique sur toutes les lectures ─────────────────────
  query: {
    residence: {
      findMany:  ({ args, query }) => query(withDeletedAt(args)),
      findFirst: ({ args, query }) => query(withDeletedAt(args)),
      count:     ({ args, query }) => query(withDeletedAt(args)),
      // findUnique est géré dans la section model ci-dessus
    },
    vehicle: {
      findMany:  ({ args, query }) => query(withDeletedAt(args)),
      findFirst: ({ args, query }) => query(withDeletedAt(args)),
      count:     ({ args, query }) => query(withDeletedAt(args)),
    },
    booking: {
      findMany:  ({ args, query }) => query(withDeletedAt(args)),
      findFirst: ({ args, query }) => query(withDeletedAt(args)),
      count:     ({ args, query }) => query(withDeletedAt(args)),
    },
  },
});

export type SoftDeleteExtension = typeof softDeleteExtension;
