-- Add lifecycle tracking fields to bookings table
ALTER TABLE `bookings` 
    ADD COLUMN `keyRetrievedAt` DATETIME(3) NULL,
    ADD COLUMN `ownerConfirmedAt` DATETIME(3) NULL,
    ADD COLUMN `checkOutAt` DATETIME(3) NULL;

-- Update BookingStatus enum to include new statuses
-- Note: MySQL doesn't support ALTER ENUM directly, so we need to recreate the column
-- First, update existing bookings to use new status values
UPDATE `bookings` SET `status` = 'CONFIRMEE' WHERE `status` = 'CONFIRMED';
UPDATE `bookings` SET `status` = 'TERMINEE' WHERE `status` = 'COMPLETED';

-- Alter the status column to include new enum values
-- MySQL requires recreating the column
ALTER TABLE `bookings` 
    MODIFY COLUMN `status` ENUM(
        'PENDING',
        'CONFIRMED',
        'CANCELLED',
        'COMPLETED',
        'CONFIRMEE',
        'CHECKIN_CLIENT',
        'CHECKIN_PROPRIO',
        'EN_COURS_SEJOUR',
        'TERMINEE'
    ) NOT NULL DEFAULT 'CONFIRMEE';

