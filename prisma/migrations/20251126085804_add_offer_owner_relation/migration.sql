-- AlterTable
ALTER TABLE `offers` ADD COLUMN `ownerId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `offers_ownerId_idx` ON `offers`(`ownerId`);

-- AddForeignKey
ALTER TABLE `offers` ADD CONSTRAINT `offers_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
