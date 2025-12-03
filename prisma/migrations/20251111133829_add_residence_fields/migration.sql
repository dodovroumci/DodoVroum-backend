-- AlterTable
ALTER TABLE `residences` ADD COLUMN `isVerified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `latitude` DOUBLE NULL,
    ADD COLUMN `longitude` DOUBLE NULL,
    ADD COLUMN `ownerId` VARCHAR(191) NULL,
    ADD COLUMN `typeResidence` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `residences_isVerified_idx` ON `residences`(`isVerified`);
