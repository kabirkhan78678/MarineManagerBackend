/*
  Warnings:

  - A unique constraint covering the columns `[documentLink]` on the table `JobServiceSheet` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `JobServiceSheet` ADD COLUMN `documentLink` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `JobServiceSheet_documentLink_key` ON `JobServiceSheet`(`documentLink`);
