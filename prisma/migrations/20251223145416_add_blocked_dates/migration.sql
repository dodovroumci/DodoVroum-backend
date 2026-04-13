-- CreateTable
CREATE TABLE `blocked_dates` (
    `id` VARCHAR(191) NOT NULL,
    `residenceId` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `blocked_dates_residenceId_idx`(`residenceId`),
    INDEX `blocked_dates_startDate_idx`(`startDate`),
    INDEX `blocked_dates_endDate_idx`(`endDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `blocked_dates` ADD CONSTRAINT `blocked_dates_residenceId_fkey` FOREIGN KEY (`residenceId`) REFERENCES `residences`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
