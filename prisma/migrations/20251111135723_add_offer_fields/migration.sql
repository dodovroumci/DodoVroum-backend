/*
  Warnings:

  - Added the required column `nbJours` to the `offers` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `offers` ADD COLUMN `imageUrl` VARCHAR(191) NULL,
    ADD COLUMN `isVerified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `nbJours` INTEGER NOT NULL DEFAULT 7,
    MODIFY `description` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `offers_isVerified_idx` ON `offers`(`isVerified`);
