-- Date réelle d'encaissement d'un paiement (renseignée par le webhook au
-- passage à COMPLETED). Nullable : un paiement non encaissé n'en a pas.

-- AlterTable
ALTER TABLE `payments` ADD COLUMN `paidAt` DATETIME(3) NULL;

-- Historique : les paiements déjà COMPLETED n'ont pas de date d'encaissement
-- enregistrée ; updatedAt (dernière écriture, en pratique le webhook) sert
-- d'approximation.
UPDATE `payments` SET `paidAt` = `updatedAt` WHERE `status` = 'COMPLETED' AND `paidAt` IS NULL;

-- CreateIndex
CREATE INDEX `payments_paidAt_idx` ON `payments`(`paidAt`);
