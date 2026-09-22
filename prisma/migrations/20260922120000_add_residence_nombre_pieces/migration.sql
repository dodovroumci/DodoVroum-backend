-- AlterTable
-- Colonne nullable : les résidences existantes restent valides sans valeur.
ALTER TABLE `residences` ADD COLUMN `nombrePieces` INTEGER NULL;
