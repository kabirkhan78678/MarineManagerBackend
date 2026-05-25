-- CreateTable
CREATE TABLE `Admin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `full_name` VARCHAR(191) NOT NULL,
    `phone_no` VARCHAR(191) NULL,
    `profile_image` VARCHAR(255) NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'ADMIN',
    `status` INTEGER NOT NULL DEFAULT 1,
    `token` VARCHAR(191) NULL,
    `last_login_at` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Admin_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
    `BSB` VARCHAR(191) NOT NULL DEFAULT '',
    `ACC` VARCHAR(191) NOT NULL DEFAULT '',
    `act_token` VARCHAR(191) NULL,
    `token` VARCHAR(191) NULL,
    `abn` VARCHAR(191) NULL,
    `isVerified` BOOLEAN NOT NULL DEFAULT false,
    `profile_image` VARCHAR(191) NULL,
    `company_logo` VARCHAR(191) NULL,
    `trade_license` VARCHAR(191) NULL,
    `accounting_software_used` LONGTEXT NULL,
    `about_us` LONGTEXT NULL,
    `service_region` LONGTEXT NULL,
    `services_offered` LONGTEXT NULL,
    `stripeCustomerId` VARCHAR(191) NULL,
    `xero_access_token` LONGTEXT NULL,
    `xero_refresh_token` VARCHAR(191) NULL,
    `xero_expiresAt` DATETIME(3) NULL,
    `xero_tenantId` VARCHAR(191) NULL,
    `xero_connected` INTEGER NOT NULL DEFAULT 0,
    `tooltipSeen` BOOLEAN NOT NULL DEFAULT false,
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
    `dock_capacity` INTEGER NULL,
    `dock_weight_category` ENUM('UP_TO_500_KG', 'UP_TO_1_TON', 'UP_TO_2_TONS', 'UP_TO_5_TONS', 'UP_TO_10_TONS', 'OVER_10_TONS') NULL,
    `dock_length_category` ENUM('UP_TO_5_FT', '5_TO_10_FT', '10_TO_20_FT', '20_TO_30_FT', '30_TO_40_FT', '40_PLUS_FT') NULL,
    `email` VARCHAR(191) NULL,
    `phone_no` VARCHAR(191) NULL,
    `userId` INTEGER NOT NULL,
    `booking_cost` VARCHAR(191) NULL,
    `booking_cost_per_day` VARCHAR(191) NULL,
    `address` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

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
    `isBoathubRego` BOOLEAN NOT NULL DEFAULT false,
    `vin` VARCHAR(191) NOT NULL,
    `make` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `engine_no` VARCHAR(191) NOT NULL,
    `engine_make` VARCHAR(191) NOT NULL,
    `engine_model` VARCHAR(191) NULL,
    `length` VARCHAR(191) NOT NULL,
    `boat_weight_category` ENUM('UP_TO_500_KG', 'UP_TO_1_TON', 'UP_TO_2_TONS', 'UP_TO_5_TONS', 'UP_TO_10_TONS', 'OVER_10_TONS') NULL,
    `boat_length_category` ENUM('UP_TO_5_FT', '5_TO_10_FT', '10_TO_20_FT', '20_TO_30_FT', '30_TO_40_FT', '40_PLUS_FT') NULL,
    `app_date` DATETIME(3) NULL,
    `book_from` DATETIME(3) NULL,
    `book_to` DATETIME(3) NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone_no` VARCHAR(191) NOT NULL,
    `docking_date` DATETIME(3) NULL,
    `boat_type` VARCHAR(191) NULL,
    `userId` INTEGER NOT NULL,
    `inviteStatus` VARCHAR(191) NULL,
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
    `hourly_rate` DOUBLE NOT NULL DEFAULT 0.0,
    `system_deactivation_status` INTEGER NOT NULL DEFAULT 1,
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
    `scheduled_start_time` DATETIME(3) NULL,
    `job_start_time` DATETIME(3) NULL,
    `job_end_time` DATETIME(3) NULL,
    `paused_durations` JSON NULL,
    `timer_status` VARCHAR(191) NULL DEFAULT 'PENDING',
    `total_active_minutes` INTEGER NULL DEFAULT 0,
    `ownerApprovalStatus` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `performanceStatus` ENUM('EARLY', 'ON_TIME', 'LATE') NULL,
    `taskEfficiency` ENUM('EXCELLENT', 'GOOD', 'AVERAGE', 'POOR') NULL,
    `completionDelayMinutes` INTEGER NULL,
    `invoiceId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartInventory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `unit_cost` DOUBLE NOT NULL,
    `usage_count` INTEGER NOT NULL DEFAULT 0,
    `stock_quantity` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('IN_STOCK', 'OUT_OF_STOCK', 'LOW_STOCK') NOT NULL DEFAULT 'IN_STOCK',
    `part_image` VARCHAR(191) NULL,
    `description` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `userId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuickLeads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `client_name` VARCHAR(191) NOT NULL,
    `client_contact_number` VARCHAR(191) NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 0,
    `notes` VARCHAR(191) NULL,
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
    `boatId` INTEGER NOT NULL DEFAULT 1,
    `userId` INTEGER NOT NULL DEFAULT 1,
    `jobNumber` VARCHAR(191) NULL,
    `personAttending` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NULL,
    `mobile` VARCHAR(191) NULL,
    `workToBeCarriedOut` LONGTEXT NULL,
    `workCarriedOut` LONGTEXT NULL,
    `cdsSignature` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `taskId` INTEGER NULL,
    `staffId` INTEGER NULL,
    `supplierId` INTEGER NULL,
    `documentLink` VARCHAR(191) NULL,

    UNIQUE INDEX `JobServiceSheet_documentLink_key`(`documentLink`),
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
CREATE TABLE `ServicePreset` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serviceTitle` VARCHAR(191) NOT NULL,
    `serviceCost` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskService` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `taskId` INTEGER NOT NULL,
    `serviceId` INTEGER NOT NULL,
    `serviceName` VARCHAR(191) NOT NULL,
    `servicePrice` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSupplier` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `supplierId` INTEGER NOT NULL,
    `name` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserSupplier_userId_supplierId_key`(`userId`, `supplierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
    `documentLink` VARCHAR(191) NULL,
    `pleasePayByDate` DATETIME(3) NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 0,
    `totalAmount` DOUBLE NOT NULL DEFAULT 0.0,
    `totalAmountAfterTax` DOUBLE NOT NULL DEFAULT 0.0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Invoice_invoiceNumber_key`(`invoiceNumber`),
    UNIQUE INDEX `Invoice_documentLink_key`(`documentLink`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Plan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NULL,
    `price` DOUBLE NOT NULL,
    `billingCycle` VARCHAR(191) NOT NULL,
    `maxStaffUsers` INTEGER NOT NULL,
    `stripePriceId` VARCHAR(191) NULL,

    UNIQUE INDEX `Plan_stripePriceId_key`(`stripePriceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Subscription` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `planId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `stripeSubscriptionId` VARCHAR(191) NULL,
    `stripeCustomerId` VARCHAR(191) NULL,
    `renewed_at` DATETIME(3) NULL,
    `sub_status` INTEGER NOT NULL,
    `start_date` DATETIME(3) NOT NULL,
    `canceled_at` DATETIME(3) NULL,
    `trial_end_date` DATETIME(3) NULL,
    `failed_at` DATETIME(3) NULL,

    UNIQUE INDEX `Subscription_userId_key`(`userId`),
    UNIQUE INDEX `Subscription_stripeSubscriptionId_key`(`stripeSubscriptionId`),
    UNIQUE INDEX `Subscription_stripeCustomerId_key`(`stripeCustomerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubscriptionHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `planId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `stripeSubscriptionId` VARCHAR(191) NULL,
    `stripeCustomerId` VARCHAR(191) NULL,
    `renewed_at` DATETIME(3) NULL,
    `sub_status` INTEGER NOT NULL,
    `start_date` DATETIME(3) NOT NULL,
    `canceled_at` DATETIME(3) NULL,
    `trial_end_date` DATETIME(3) NULL,
    `failed_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobTimerLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `taskId` INTEGER NOT NULL,
    `type` ENUM('START', 'PAUSE', 'RESUME', 'COMPLETE') NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskSupplierOffer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `taskId` INTEGER NOT NULL,
    `supplierId` INTEGER NOT NULL,
    `offered_price` DOUBLE NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'REJECTED') NOT NULL,
    `responded_at` DATETIME(3) NULL,

    UNIQUE INDEX `TaskSupplierOffer_taskId_supplierId_key`(`taskId`, `supplierId`),
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
ALTER TABLE `Task` ADD CONSTRAINT `Task_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartInventory` ADD CONSTRAINT `PartInventory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuickLeads` ADD CONSTRAINT `QuickLeads_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DockBooking` ADD CONSTRAINT `DockBooking_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DockBooking` ADD CONSTRAINT `DockBooking_dockId_fkey` FOREIGN KEY (`dockId`) REFERENCES `Dock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DockBooking` ADD CONSTRAINT `DockBooking_boatId_fkey` FOREIGN KEY (`boatId`) REFERENCES `Boat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobServiceSheet` ADD CONSTRAINT `JobServiceSheet_boatId_fkey` FOREIGN KEY (`boatId`) REFERENCES `Boat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobServiceSheet` ADD CONSTRAINT `JobServiceSheet_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE `TaskService` ADD CONSTRAINT `TaskService_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskService` ADD CONSTRAINT `TaskService_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `ServicePreset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSupplier` ADD CONSTRAINT `UserSupplier_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSupplier` ADD CONSTRAINT `UserSupplier_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Material` ADD CONSTRAINT `Material_jobServiceSheetId_fkey` FOREIGN KEY (`jobServiceSheetId`) REFERENCES `JobServiceSheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_boatId_fkey` FOREIGN KEY (`boatId`) REFERENCES `Boat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubscriptionHistory` ADD CONSTRAINT `SubscriptionHistory_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubscriptionHistory` ADD CONSTRAINT `SubscriptionHistory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobTimerLog` ADD CONSTRAINT `JobTimerLog_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskSupplierOffer` ADD CONSTRAINT `TaskSupplierOffer_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskSupplierOffer` ADD CONSTRAINT `TaskSupplierOffer_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
