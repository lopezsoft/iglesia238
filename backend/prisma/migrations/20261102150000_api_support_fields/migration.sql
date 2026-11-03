-- Campos que la API necesita y que el esquema inicial no tenía.
-- Generada con `prisma migrate diff` (sin base de datos) y revisada a mano: las columnas obligatorias
-- se agregan como NULL, se rellenan las filas existentes y recién entonces se exige NOT NULL.

-- Sede: abreviatura estable para el código de miembro y de carné (SC-0153).
ALTER TABLE `congregations` ADD COLUMN `code` VARCHAR(10) NULL;
-- Las sedes existentes reciben un código provisional y único (S + id); el administrador lo corrige al editarla.
UPDATE `congregations` SET `code` = CONCAT('S', `id`) WHERE `code` IS NULL;
ALTER TABLE `congregations` MODIFY `code` VARCHAR(10) NOT NULL;
CREATE UNIQUE INDEX `congregations_denomination_id_code_key` ON `congregations`(`denomination_id`, `code`);

-- Política de privacidad: borrador o publicada. Las políticas que ya existían regían, así que quedan publicadas.
ALTER TABLE `privacy_policies`
    ADD COLUMN `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN `published_at` DATETIME(3) NULL;
UPDATE `privacy_policies` SET `status` = 'PUBLISHED', `published_at` = `effective_from`;

-- Carné de miembro: sede y número de miembro que se imprimieron, y anulación.
ALTER TABLE `membership_cards`
    ADD COLUMN `congregation_id` INTEGER NULL,
    ADD COLUMN `member_number` INTEGER NULL,
    ADD COLUMN `voided_at` DATETIME(3) NULL,
    ADD COLUMN `void_reason` VARCHAR(255) NULL;
-- Los carnés existentes toman la sede actual del miembro y su número vigente. Si algún miembro no tiene
-- registro vigente, el MODIFY siguiente falla en lugar de inventar un número.
UPDATE `membership_cards` AS `card`
    JOIN `members` AS `member` ON `member`.`id` = `card`.`member_id`
    JOIN `member_registry_entries` AS `entry`
        ON `entry`.`member_id` = `card`.`member_id` AND `entry`.`ended_on` IS NULL
    SET `card`.`congregation_id` = `member`.`congregation_id`,
        `card`.`member_number` = `entry`.`member_number`;
ALTER TABLE `membership_cards`
    MODIFY `congregation_id` INTEGER NOT NULL,
    MODIFY `member_number` INTEGER NOT NULL;
ALTER TABLE `membership_cards` ADD CONSTRAINT `membership_cards_denomination_id_congregation_id_fkey`
    FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Certificado: quién lo emitió y por qué se anuló.
ALTER TABLE `certificates`
    ADD COLUMN `issued_by_id` INTEGER NULL,
    ADD COLUMN `void_reason` VARCHAR(255) NULL;
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_issued_by_id_fkey`
    FOREIGN KEY (`issued_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Matrimonio: lugar y oficiante.
ALTER TABLE `marriages`
    ADD COLUMN `place` VARCHAR(150) NULL,
    ADD COLUMN `officiant_id` INTEGER NULL;
ALTER TABLE `marriages` ADD CONSTRAINT `marriages_denomination_id_officiant_id_fkey`
    FOREIGN KEY (`denomination_id`, `officiant_id`) REFERENCES `persons`(`denomination_id`, `id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Estudio de una persona: institución y año.
ALTER TABLE `person_studies`
    ADD COLUMN `institution` VARCHAR(150) NULL,
    ADD COLUMN `year` INTEGER NULL;

-- Asistencia: quién y cuándo la registró. Las sesiones existentes conservan el instante de esta migración.
ALTER TABLE `attendance_sessions`
    ADD COLUMN `recorded_by_id` INTEGER NULL,
    ADD COLUMN `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_recorded_by_id_fkey`
    FOREIGN KEY (`recorded_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Libro de caja: consultas por sede y fecha (reportes y panel).
CREATE INDEX `cash_transactions_congregation_id_posted_on_idx`
    ON `cash_transactions`(`congregation_id`, `posted_on`);

-- Reglas que Prisma no puede expresar (también documentadas en prisma/sql/constraints.sql).
ALTER TABLE `privacy_policies`
    ADD CONSTRAINT `chk_privacy_policies_published` CHECK (
        (`status` = 'PUBLISHED') = (`published_at` IS NOT NULL)
    );

ALTER TABLE `membership_cards`
    ADD CONSTRAINT `chk_membership_cards_void` CHECK (
        (`voided_at` IS NULL) = (`void_reason` IS NULL)
    );

ALTER TABLE `certificates`
    ADD CONSTRAINT `chk_certificates_void_reason` CHECK (
        `void_reason` IS NULL OR `voided_at` IS NOT NULL
    );

ALTER TABLE `marriages`
    ADD CONSTRAINT `chk_marriages_officiant` CHECK (
        `officiant_id` IS NULL OR (`officiant_id` <> `spouse1_id` AND `officiant_id` <> `spouse2_id`)
    );

ALTER TABLE `person_studies`
    ADD CONSTRAINT `chk_person_studies_year` CHECK (`year` IS NULL OR `year` BETWEEN 1900 AND 2200);
