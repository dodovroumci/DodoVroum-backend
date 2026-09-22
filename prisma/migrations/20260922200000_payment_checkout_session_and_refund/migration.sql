-- Session GeniusPay par Payment, type de paiement et remboursements à traiter.
-- Toutes les colonnes sont nullables : les Payments existants restent valides
-- (paymentOption null = Payment antérieur, jamais déduit du montant).

-- AlterTable
ALTER TABLE `payments` ADD COLUMN `checkoutExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `checkoutRequestedAt` DATETIME(3) NULL,
    ADD COLUMN `checkoutUrl` VARCHAR(2048) NULL,
    ADD COLUMN `paymentOption` ENUM('FULL_PAYMENT', 'DOWN_PAYMENT') NULL,
    ADD COLUMN `refundReason` ENUM('BOOKING_EXPIRED', 'BOOKING_CANCELLED', 'DOUBLE_PAYMENT') NULL,
    ADD COLUMN `refundRequiredAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `payments_transactionId_idx` ON `payments`(`transactionId`);

-- CreateIndex
CREATE INDEX `payments_refundRequiredAt_idx` ON `payments`(`refundRequiredAt`);
