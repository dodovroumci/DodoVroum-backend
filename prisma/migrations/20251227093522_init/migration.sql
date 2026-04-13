-- AlterTable
ALTER TABLE `residences` MODIFY `amenities` LONGTEXT NOT NULL,
    MODIFY `images` LONGTEXT NOT NULL;

-- AlterTable
ALTER TABLE `vehicles` MODIFY `features` LONGTEXT NOT NULL,
    MODIFY `images` LONGTEXT NOT NULL;
