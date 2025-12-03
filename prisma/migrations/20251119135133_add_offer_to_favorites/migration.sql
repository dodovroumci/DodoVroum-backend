/*
  Warnings:

  - A unique constraint covering the columns `[userId,offerId]` on the table `favorites` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `favorites` ADD COLUMN `offerId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `favorites_userId_offerId_key` ON `favorites`(`userId`, `offerId`);

-- AddForeignKey
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `offers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
