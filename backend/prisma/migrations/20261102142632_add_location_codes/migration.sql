-- Códigos oficiales de ubicación: ISO 3166-1 en países y DANE (DIVIPOLA) en departamentos y municipios.

-- Country: iso_code (alfa-3) se reemplaza por iso_alpha2, iso_alpha3 y phone_code.
-- Las filas existentes se conservan: el alfa-3 pasa a iso_alpha3 y el alfa-2 se completa antes de exigirlo.
ALTER TABLE `countries`
    ADD COLUMN `iso_alpha2` CHAR(2) NULL,
    ADD COLUMN `iso_alpha3` CHAR(3) NULL,
    ADD COLUMN `phone_code` VARCHAR(4) NULL;

UPDATE `countries` SET `iso_alpha3` = `iso_code`;
-- Hasta esta migración el seed solo creaba Colombia. Cualquier otra fila deja iso_alpha2 en NULL
-- y el MODIFY siguiente falla, en lugar de inventar un código.
UPDATE `countries` SET `iso_alpha2` = 'CO', `phone_code` = '57' WHERE `iso_code` = 'COL';

DROP INDEX `countries_iso_code_key` ON `countries`;
ALTER TABLE `countries` DROP COLUMN `iso_code`,
    MODIFY `iso_alpha2` CHAR(2) NOT NULL;

CREATE UNIQUE INDEX `countries_iso_alpha2_key` ON `countries`(`iso_alpha2`);
CREATE UNIQUE INDEX `countries_iso_alpha3_key` ON `countries`(`iso_alpha3`);

-- Region y Municipality: código oficial opcional, único dentro de su país o departamento.
ALTER TABLE `regions` ADD COLUMN `code` VARCHAR(10) NULL;
CREATE UNIQUE INDEX `regions_country_id_code_key` ON `regions`(`country_id`, `code`);

ALTER TABLE `municipalities` ADD COLUMN `code` VARCHAR(10) NULL;
CREATE UNIQUE INDEX `municipalities_region_id_code_key` ON `municipalities`(`region_id`, `code`);
