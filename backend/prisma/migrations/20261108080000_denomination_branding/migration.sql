-- AlterTable
ALTER TABLE `denominations` MODIFY `logo_path` VARCHAR(255) NULL COMMENT 'Clave del archivo del logo en el almacenamiento (branding/<id>/logo-<hash>.png o .jpg); nulo si no tiene logo. La API lo sirve por URL y los PDF lo incrustan.',
    ADD COLUMN `primary_color` VARCHAR(7) NULL COMMENT 'Color institucional en formato #RRGGBB, con contraste suficiente sobre blanco para el texto de los documentos; nulo usa el color por defecto del sistema.';
