-- AlterTable
ALTER TABLE `JobServiceSheet` ADD COLUMN `boatId` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `userId` INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE `JobServiceSheet` ADD CONSTRAINT `JobServiceSheet_boatId_fkey` FOREIGN KEY (`boatId`) REFERENCES `Boat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobServiceSheet` ADD CONSTRAINT `JobServiceSheet_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
