-- AlterTable
ALTER TABLE `certificate_types` MODIFY `template` TEXT NULL COMMENT 'Cuerpo personalizado con marcadores {{memberName}}, {{document}}, {{memberCode}}, {{congregation}}, {{sede}}, {{joinedOn}}, {{baptismDate}}, {{denomination}}, {{city}}, {{issuedOn}}, {{pastorName}}, {{secretaryName}}; nulo usa el texto por defecto.',
    ADD COLUMN `intro_template` VARCHAR(500) NULL COMMENT 'Encabezado del cuerpo con los mismos marcadores que template (máximo 500 caracteres); nulo usa «La Secretaría de {{sede}} hace constar».',
    ADD COLUMN `closing_template` VARCHAR(500) NULL COMMENT 'Párrafo de cierre con los mismos marcadores que template (máximo 500 caracteres); nulo usa «Se expide en {{city}}, el {{issuedOn}}, a solicitud del interesado(a).».',
    ADD COLUMN `pastor_title_template` VARCHAR(120) NULL COMMENT 'Título impreso bajo la firma del pastor, con los mismos marcadores que template (máximo 120 caracteres); nulo usa «Pastor(a), {{congregation}}».',
    ADD COLUMN `secretary_title_template` VARCHAR(120) NULL COMMENT 'Título impreso bajo la firma de la secretaría, con los mismos marcadores que template (máximo 120 caracteres); nulo usa «Secretario(a), {{congregation}}».';
