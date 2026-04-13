-- AlterTable
ALTER TABLE `blocked_dates` ADD COLUMN `vehicleId` VARCHAR(191) NULL,
    MODIFY `residenceId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `blocked_dates_vehicleId_idx` ON `blocked_dates`(`vehicleId`);

-- AddForeignKey
ALTER TABLE `blocked_dates` ADD CONSTRAINT `blocked_dates_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
