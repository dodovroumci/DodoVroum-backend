-- AlterTable
ALTER TABLE `users` ADD COLUMN `avatar` VARCHAR(191) NULL,
    ADD COLUMN `isVerified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `localisation` VARCHAR(191) NULL,
    ADD COLUMN `typeProprietaire` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `identity_verifications` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `identityNumber` VARCHAR(191) NULL,
    `identityType` ENUM('CNI', 'PASSPORT', 'PERMIT', 'DRIVER_LICENSE', 'OTHER') NULL,
    `identityPhotoFront` VARCHAR(191) NULL,
    `identityPhotoBack` VARCHAR(191) NULL,
    `identityPhotoExtra` VARCHAR(191) NULL,
    `verificationStatus` ENUM('PENDING', 'VERIFIED', 'REJECTED', 'UNDER_REVIEW') NOT NULL DEFAULT 'PENDING',
    `verifiedAt` DATETIME(3) NULL,
    `verifiedBy` VARCHAR(191) NULL,
    `rejectionReason` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `identity_verifications_userId_key`(`userId`),
    INDEX `identity_verifications_userId_idx`(`userId`),
    INDEX `identity_verifications_verificationStatus_idx`(`verificationStatus`),
    INDEX `identity_verifications_submittedAt_idx`(`submittedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `users_role_idx` ON `users`(`role`);

-- CreateIndex
CREATE INDEX `users_isVerified_idx` ON `users`(`isVerified`);

-- AddForeignKey
ALTER TABLE `identity_verifications` ADD CONSTRAINT `identity_verifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
