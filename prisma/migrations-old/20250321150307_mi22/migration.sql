/*
  Warnings:

  - You are about to drop the column `furtherActionRequired` on the `JobServiceSheet` table. All the data in the column will be lost.
  - Made the column `engine_make` on table `Boat` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `Boat` ADD COLUMN `inviteStatus` VARCHAR(191) NULL,
    MODIFY `engine_make` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `JobServiceSheet` DROP COLUMN `furtherActionRequired`;

-- AlterTable
ALTER TABLE `Task` ADD COLUMN `invoiceId` INTEGER NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `ACC` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `BSB` VARCHAR(191) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `UserSupplier` ADD COLUMN `name` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Material` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `materialName` VARCHAR(191) NULL,
    `unitsUsed` DOUBLE NOT NULL,
    `pricePerUnit` DOUBLE NULL,
    `totalPrice` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `jobServiceSheetId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoiceNumber` VARCHAR(191) NULL,
    `boatId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `pleasePayByDate` DATETIME(3) NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 0,
    `totalAmount` DOUBLE NOT NULL DEFAULT 0.0,
    `totalAmountAfterTax` DOUBLE NOT NULL DEFAULT 0.0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Invoice_invoiceNumber_key`(`invoiceNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Material` ADD CONSTRAINT `Material_jobServiceSheetId_fkey` FOREIGN KEY (`jobServiceSheetId`) REFERENCES `JobServiceSheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_boatId_fkey` FOREIGN KEY (`boatId`) REFERENCES `Boat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
