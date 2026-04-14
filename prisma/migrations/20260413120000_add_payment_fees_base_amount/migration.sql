-- Montants détaillés pour les paiements (ex. GeniusPay : base + frais 1 %)
ALTER TABLE `payments`
    ADD COLUMN `baseAmount` DOUBLE NULL,
    ADD COLUMN `fees` DOUBLE NULL;
