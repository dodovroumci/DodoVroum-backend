-- AlterTable
ALTER TABLE `vehicles` ADD COLUMN `address` VARCHAR(191) NULL,
    ADD COLUMN `color` VARCHAR(191) NULL,
    ADD COLUMN `condition` VARCHAR(191) NULL,
    ADD COLUMN `isVerified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `mileage` INTEGER NULL,
    ADD COLUMN `title` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `vehicles_isVerified_idx` ON `vehicles`(`isVerified`);
