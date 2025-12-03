-- CreateIndex
CREATE INDEX `residences_ownerId_idx` ON `residences`(`ownerId`);

-- AddForeignKey
ALTER TABLE `residences` ADD CONSTRAINT `residences_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
