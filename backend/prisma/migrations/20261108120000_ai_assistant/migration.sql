-- CreateTable
CREATE TABLE `congregation_ai_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el registro: la dueña de estos ajustes y de la clave (FK a congregations.id).',
    `chat_enabled` BOOLEAN NOT NULL DEFAULT false COMMENT 'Indica si el chat con el asistente está disponible para los usuarios de la sede; además exige que haya una clave guardada.',
    `mcp_enabled` BOOLEAN NOT NULL DEFAULT false COMMENT 'Indica si la sede acepta conexiones MCP externas (con los tokens de ai_access_tokens); no necesita clave porque la IA la pone quien se conecta.',
    `provider` VARCHAR(20) NOT NULL DEFAULT 'ANTHROPIC' COMMENT 'Proveedor de IA de la clave; hoy solo ANTHROPIC.',
    `model` VARCHAR(60) NOT NULL DEFAULT 'claude-opus-5-5' COMMENT 'Modelo que usa el chat de la sede (por ejemplo claude-opus-5-5); la API solo acepta los de su lista.',
    `api_key_cipher` VARCHAR(1024) NULL COMMENT 'Clave del proveedor cifrada con AES-256-GCM (formato versión.iv.etiqueta.texto en base64url); nula si la sede no ha guardado ninguna.',
    `api_key_last4` VARCHAR(4) NULL COMMENT 'Últimos 4 caracteres de la clave guardada, para que la sede reconozca cuál es; nulos si no hay clave.',
    `updated_by_id` INTEGER NULL COMMENT 'Usuario que hizo el último cambio; nulo si no hay usuario asociado (FK a users.id).',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',
    `updated_at` DATETIME(3) NOT NULL COMMENT 'Fecha y hora de la última modificación (UTC).',

    UNIQUE INDEX `congregation_ai_settings_congregation_id_key`(`congregation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Ajustes del asistente de IA de una sede: si lo activa para el chat de la aplicación y para conexiones MCP externas, el modelo que usa y la clave del proveedor que pegó la propia sede. Ámbito: por sede; una fila por sede. La clave se guarda cifrada (AES-256-GCM) y nunca se devuelve completa: la API solo muestra sus últimos 4 caracteres. Cada sede decide si lo usa: sin clave o sin activar, el asistente no funciona en ella.';

-- CreateTable
CREATE TABLE `ai_access_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que da acceso el token: solo ve los datos de esa sede (FK a congregations.id).',
    `name` VARCHAR(80) NOT NULL COMMENT 'Nombre que la sede le dio a la conexión para reconocerla («Claude del pastor»); máximo 80 caracteres.',
    `token_hash` VARCHAR(64) NOT NULL COMMENT 'Hash SHA-256 del token en hexadecimal; único, y con él se busca el token al conectarse.',
    `token_prefix` VARCHAR(16) NOT NULL COMMENT 'Primeros caracteres del token, para reconocerlo en la lista sin mostrarlo entero.',
    `created_by_id` INTEGER NOT NULL COMMENT 'Usuario que creó el token (FK a users.id).',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',
    `last_used_at` DATETIME(3) NULL COMMENT 'Fecha y hora del último uso (UTC), con precisión de un minuto; nula si nunca se ha usado.',
    `expires_at` DATETIME(3) NULL COMMENT 'Fecha y hora de vencimiento (UTC); nula si no vence.',
    `revoked_at` DATETIME(3) NULL COMMENT 'Fecha y hora de revocación (UTC); nula si el token sigue vigente.',

    UNIQUE INDEX `ai_access_tokens_token_hash_key`(`token_hash`),
    INDEX `ai_access_tokens_congregation_id_revoked_at_idx`(`congregation_id`, `revoked_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Token con el que una herramienta externa de IA (Claude, ChatGPT u otra) se conecta por MCP a los datos agregados de una sede. Ámbito: por sede. Solo se guarda el hash SHA-256: el token completo se muestra una vez, al crearlo. Se revoca, nunca se borra; deja de servir si vence, se revoca o la sede desactiva las conexiones MCP.';

-- AddForeignKey
ALTER TABLE `congregation_ai_settings` ADD CONSTRAINT `congregation_ai_settings_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `congregation_ai_settings` ADD CONSTRAINT `congregation_ai_settings_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ai_access_tokens` ADD CONSTRAINT `ai_access_tokens_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ai_access_tokens` ADD CONSTRAINT `ai_access_tokens_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
