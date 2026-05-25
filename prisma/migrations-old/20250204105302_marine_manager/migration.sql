-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `first_name` VARCHAR(191) NOT NULL,
    `last_name` VARCHAR(191) NOT NULL,
    `company_name` LONGTEXT NOT NULL,
    `phone_no` VARCHAR(191) NOT NULL,
    `fcm_token` VARCHAR(191) NULL,
    `act_token` VARCHAR(191) NULL,
    `token` VARCHAR(191) NULL,
    `abn` VARCHAR(191) NULL,
    `isVerified` BOOLEAN NOT NULL DEFAULT false,
    `company_logo` VARCHAR(191) NULL,
    `trade_license` VARCHAR(191) NULL,
    `accounting_software_used` LONGTEXT NULL,
    `about_us` LONGTEXT NULL,
    `service_region` LONGTEXT NULL,
    `services_offered` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InsuranceFile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `filename` VARCHAR(191) NULL,
    `userId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Dock` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone_no` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `booking_cost` VARCHAR(191) NOT NULL,
    `booking_cost_per_day` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Boat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `owners_name` VARCHAR(191) NOT NULL,
    `fileKey` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `rego` VARCHAR(191) NOT NULL,
    `vin` VARCHAR(191) NOT NULL,
    `make` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `engine_no` VARCHAR(191) NOT NULL,
    `engine_make` VARCHAR(191) NULL,
    `engine_model` VARCHAR(191) NULL,
    `length` VARCHAR(191) NOT NULL,
    `app_date` DATETIME(3) NULL,
    `book_from` DATETIME(3) NULL,
    `book_to` DATETIME(3) NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone_no` VARCHAR(191) NOT NULL,
    `docking_date` DATETIME(3) NULL,
    `boat_type` VARCHAR(191) NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Staff_Member` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `showPassword` VARCHAR(191) NULL,
    `token` VARCHAR(191) NULL,
    `role` VARCHAR(191) NOT NULL,
    `full_name` VARCHAR(191) NOT NULL,
    `home_address` LONGTEXT NOT NULL,
    `userId` INTEGER NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `phone_no` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Staff_Member_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Supplier` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NULL,
    `first_name` VARCHAR(191) NULL,
    `last_name` VARCHAR(191) NULL,
    `company_name` LONGTEXT NULL,
    `company_description` LONGTEXT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `phone_no` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `company_logo` VARCHAR(191) NULL,
    `abn` VARCHAR(191) NULL,
    `token` VARCHAR(191) NULL,
    `trade_license` VARCHAR(191) NULL,
    `accounting_software_used` LONGTEXT NULL,
    `about_us` LONGTEXT NULL,
    `service_region` LONGTEXT NULL,
    `services_offered` LONGTEXT NULL,
    `complete_profile_status` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Supplier_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupplierInsuranceFile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `filename` VARCHAR(191) NULL,
    `supplierId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `description` LONGTEXT NULL,
    `time_alloted` VARCHAR(191) NOT NULL,
    `quoted_value` VARCHAR(191) NOT NULL,
    `boatId` INTEGER NOT NULL,
    `assignStaffId` INTEGER NULL,
    `status` INTEGER NOT NULL DEFAULT 0,
    `supplierId` INTEGER NULL,
    `userId` INTEGER NOT NULL,
    `assign_to` ENUM('STAFF', 'OUTSOURCED') NOT NULL,
    `date_scheduled_from` DATETIME(3) NOT NULL,
    `date_scheduled_to` DATETIME(3) NOT NULL,
    `taskInfo` LONGTEXT NULL,
    `supplierNotes` LONGTEXT NULL,
    `futureWatchList` LONGTEXT NULL,
    `recommendedDueDate` DATETIME(3) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `isRecurring` INTEGER NOT NULL DEFAULT 0,
    `completed_at` DATETIME(3) NULL,
    `contacted_status` INTEGER NOT NULL DEFAULT 0,
    `jobNumber` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuickLeads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `client_name` VARCHAR(191) NOT NULL,
    `client_contact_number` VARCHAR(191) NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 0,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DockBooking` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dockId` INTEGER NOT NULL,
    `boatId` INTEGER NULL,
    `book_from` DATETIME(3) NOT NULL,
    `book_to` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobServiceSheet` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATETIME(3) NOT NULL,
    `jobNumber` VARCHAR(191) NULL,
    `personAttending` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NULL,
    `mobile` VARCHAR(191) NULL,
    `workToBeCarriedOut` LONGTEXT NULL,
    `workCarriedOut` LONGTEXT NULL,
    `furtherActionRequired` LONGTEXT NULL,
    `cdsSignature` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `taskId` INTEGER NULL,
    `staffId` INTEGER NULL,
    `supplierId` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskPhoto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `url` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `staffId` INTEGER NULL,
    `supplierId` INTEGER NULL,
    `taskId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `byStaffId` INTEGER NULL,
    `toUserId` INTEGER NOT NULL,
    `taskId` INTEGER NOT NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `content` VARCHAR(191) NULL,
    `type` VARCHAR(191) NULL,
    `data` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSupplier` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `supplierId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserSupplier_userId_supplierId_key`(`userId`, `supplierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `InsuranceFile` ADD CONSTRAINT `InsuranceFile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Dock` ADD CONSTRAINT `Dock_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Boat` ADD CONSTRAINT `Boat_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Staff_Member` ADD CONSTRAINT `Staff_Member_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierInsuranceFile` ADD CONSTRAINT `SupplierInsuranceFile_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_boatId_fkey` FOREIGN KEY (`boatId`) REFERENCES `Boat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_assignStaffId_fkey` FOREIGN KEY (`assignStaffId`) REFERENCES `Staff_Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuickLeads` ADD CONSTRAINT `QuickLeads_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DockBooking` ADD CONSTRAINT `DockBooking_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DockBooking` ADD CONSTRAINT `DockBooking_dockId_fkey` FOREIGN KEY (`dockId`) REFERENCES `Dock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DockBooking` ADD CONSTRAINT `DockBooking_boatId_fkey` FOREIGN KEY (`boatId`) REFERENCES `Boat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobServiceSheet` ADD CONSTRAINT `JobServiceSheet_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobServiceSheet` ADD CONSTRAINT `JobServiceSheet_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff_Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobServiceSheet` ADD CONSTRAINT `JobServiceSheet_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskPhoto` ADD CONSTRAINT `TaskPhoto_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff_Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskPhoto` ADD CONSTRAINT `TaskPhoto_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskPhoto` ADD CONSTRAINT `TaskPhoto_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_byStaffId_fkey` FOREIGN KEY (`byStaffId`) REFERENCES `Staff_Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSupplier` ADD CONSTRAINT `UserSupplier_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSupplier` ADD CONSTRAINT `UserSupplier_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
