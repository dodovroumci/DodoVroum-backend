-- AlterTable
ALTER TABLE `users` ADD COLUMN `contractAcceptedAt` DATETIME(3) NULL,
    ADD COLUMN `contractVersion` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `residences` ADD COLUMN `moderationStatus` ENUM('ACTIVE', 'HIDDEN', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE `vehicles` ADD COLUMN `moderationStatus` ENUM('ACTIVE', 'HIDDEN', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE `listing_reports` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NULL,
    `residenceId` VARCHAR(191) NULL,
    `reporterEmail` VARCHAR(191) NOT NULL,
    `reporterPhone` VARCHAR(191) NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('OPEN', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,
    `resolvedBy` VARCHAR(191) NULL,

    INDEX `listing_reports_vehicleId_idx`(`vehicleId`),
    INDEX `listing_reports_residenceId_idx`(`residenceId`),
    INDEX `listing_reports_status_idx`(`status`),
    INDEX `listing_reports_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `residences_moderationStatus_idx` ON `residences`(`moderationStatus`);

-- CreateIndex
CREATE INDEX `vehicles_moderationStatus_idx` ON `vehicles`(`moderationStatus`);

-- AddForeignKey
ALTER TABLE `listing_reports` ADD CONSTRAINT `listing_reports_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `listing_reports` ADD CONSTRAINT `listing_reports_residenceId_fkey` FOREIGN KEY (`residenceId`) REFERENCES `residences`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

