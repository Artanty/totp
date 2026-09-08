-- CreateTable
CREATE TABLE `App` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `adminId` INTEGER NOT NULL,
    `gateUserId` INTEGER NOT NULL,
    `tokenId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `App_slug_key`(`slug`),
    UNIQUE INDEX `App_gateUserId_key`(`gateUserId`),
    UNIQUE INDEX `App_tokenId_key`(`tokenId`),
    INDEX `App_adminId_idx`(`adminId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `App` ADD CONSTRAINT `App_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `App` ADD CONSTRAINT `App_gateUserId_fkey` FOREIGN KEY (`gateUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `App` ADD CONSTRAINT `App_tokenId_fkey` FOREIGN KEY (`tokenId`) REFERENCES `Token`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;