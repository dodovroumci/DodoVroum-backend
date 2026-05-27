-- AlterTable: ajoute bookingId dans blocked_dates
ALTER TABLE `blocked_dates` ADD COLUMN `bookingId` VARCHAR(191) NULL;

-- Index sur bookingId
CREATE INDEX `blocked_dates_bookingId_fkey` ON `blocked_dates`(`bookingId`);

-- Foreign key vers bookings avec Cascade
ALTER TABLE `blocked_dates`
  ADD CONSTRAINT `blocked_dates_bookingId_fkey`
  FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
