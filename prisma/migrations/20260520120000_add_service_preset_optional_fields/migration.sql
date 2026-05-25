ALTER TABLE `ServicePreset`
    ADD COLUMN `boatLength` VARCHAR(191) NULL,
    ADD COLUMN `boatHeight` VARCHAR(191) NULL,
    ADD COLUMN `materialCost` DOUBLE NULL,
    ADD COLUMN `labourAdjustments` DOUBLE NULL;
