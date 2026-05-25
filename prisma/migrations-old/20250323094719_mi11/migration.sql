/*
  Warnings:

  - A unique constraint covering the columns `[documentLink]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `documentLink` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Invoice_documentLink_key` ON `Invoice`(`documentLink`);
