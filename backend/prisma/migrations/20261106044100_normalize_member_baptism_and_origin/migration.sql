-- AlterTable
ALTER TABLE `members` ADD COLUMN `baptism_municipality_id` INTEGER NULL COMMENT 'Municipio donde fue bautizado en agua, cuando se identifica en el catálogo (FK a municipalities.id).',
    ADD COLUMN `previous_congregation_id` INTEGER NULL COMMENT 'Sede de procedencia dentro de la misma denominación, si el miembro venía de otra congregación registrada (FK a congregations.id).';

-- AddForeignKey
ALTER TABLE `members` ADD CONSTRAINT `members_baptism_municipality_id_fkey` FOREIGN KEY (`baptism_municipality_id`) REFERENCES `municipalities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `members` ADD CONSTRAINT `members_denomination_id_previous_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `previous_congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
