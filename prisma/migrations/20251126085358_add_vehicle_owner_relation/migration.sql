-- AlterTable
ALTER TABLE `vehicles` ADD COLUMN `ownerId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `vehicles_ownerId_idx` ON `vehicles`(`ownerId`);

-- AddForeignKey
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
