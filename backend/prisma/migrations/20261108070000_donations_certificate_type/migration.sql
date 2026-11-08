-- AlterTable
ALTER TABLE `certificate_types` MODIFY `template` TEXT NULL COMMENT 'Cuerpo personalizado con marcadores {{memberName}}, {{document}}, {{memberCode}}, {{congregation}}, {{sede}}, {{joinedOn}}, {{baptismDate}}, {{denomination}}, {{city}}, {{issuedOn}}, {{pastorName}}, {{secretaryName}}, {{fiscalYear}}, {{periodFrom}}, {{periodTo}}, {{totalAmount}}, {{totalInWords}} (los cinco últimos solo en el certificado de donaciones, código DON); nulo usa el texto por defecto.';

-- Data: the donations certificate (DON) for the denominations that already exist.
-- The ones created from now on get it with the denomination template.
INSERT INTO `certificate_types` (`denomination_id`, `code`, `name`)
SELECT d.`id`, 'DON', 'Certificado de donaciones'
FROM `denominations` d
WHERE NOT EXISTS (
    SELECT 1 FROM `certificate_types` t
    WHERE t.`denomination_id` = d.`id` AND t.`code` = 'DON'
);
