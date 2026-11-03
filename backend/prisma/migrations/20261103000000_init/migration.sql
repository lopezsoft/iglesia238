-- CreateTable
CREATE TABLE `funds` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `name` VARCHAR(120) NOT NULL COMMENT 'Nombre del fondo o comité, único dentro de la denominación (máx. 120 caracteres).',
    `is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Indica si el fondo está activo; un fondo inactivo no recibe movimientos de caja nuevos.',

    UNIQUE INDEX `funds_denomination_id_name_key`(`denomination_id`, `name`),
    UNIQUE INDEX `funds_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Fondo o comité contable (Fondo Local, Dorcas, Jóvenes, Escuela Dominical, Construcción...). Ámbito: por denominación, compartido por todas sus sedes. Cada movimiento de caja y cada línea de presupuesto se imputa a un fondo; el nombre es único dentro de la denominación.';

-- CreateTable
CREATE TABLE `accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `default_fund_id` INTEGER NULL COMMENT 'Fondo sugerido al consolidar aportes y liquidar el diezmo; si es nulo se usa el fondo activo más antiguo o el Fondo Local, respectivamente. El fondo real queda en cada movimiento (FK a funds.id).',
    `parent_id` INTEGER NULL COMMENT 'Cuenta grupo de la que depende esta subcuenta; nulo en las cuentas raíz (FK a accounts.id).',
    `code` VARCHAR(20) NOT NULL COMMENT 'Código numérico de la cuenta (solo dígitos, máx. 20), único en la denominación; el de una subcuenta empieza por el de su padre.',
    `legacy_code` VARCHAR(20) NULL COMMENT 'Código que tenía la cuenta en los libros Excel de origen; informativo y no único.',
    `name` VARCHAR(150) NOT NULL COMMENT 'Nombre de la cuenta (máx. 150 caracteres).',
    `nature` ENUM('INCOME', 'EXPENSE') NOT NULL COMMENT 'Naturaleza: INCOME (ingreso, recibe entradas) o EXPENSE (egreso, recibe salidas); la subcuenta hereda la del padre y no cambia después de creada.',
    `is_postable` BOOLEAN NOT NULL DEFAULT true COMMENT 'Indica si la cuenta es imputable y recibe movimientos; las cuentas grupo, con subcuentas, no lo son.',
    `is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Indica si la cuenta está activa; una cuenta inactiva no admite movimientos nuevos.',

    UNIQUE INDEX `accounts_denomination_id_code_key`(`denomination_id`, `code`),
    UNIQUE INDEX `accounts_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Cuenta del plan de cuentas, en jerarquía de grupos y subcuentas. Ámbito: por denominación. Solo las cuentas imputables reciben movimientos; una subcuenta hereda la naturaleza del padre y su código empieza por el del padre. El código legado no es único: en los Excel un grupo y su hijo comparten código.';

-- CreateTable
CREATE TABLE `contribution_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `category` ENUM('TITHE', 'OFFERING', 'FIRST_FRUITS', 'VOW', 'OTHER') NOT NULL COMMENT 'Categoría: TITHE (diezmo, se liquida), OFFERING (ofrenda), FIRST_FRUITS (primicia), VOW (voto, admite promesa) u OTHER (otro).',
    `code` VARCHAR(30) NOT NULL COMMENT 'Código corto en mayúsculas (A-Z, 0-9 y guion bajo, de 2 a 30 caracteres), único en la denominación.',
    `name` VARCHAR(100) NOT NULL COMMENT 'Nombre visible del tipo de aporte (máx. 100 caracteres).',
    `account_id` INTEGER NOT NULL COMMENT 'Cuenta de ingreso imputable donde se contabilizan los aportes de este tipo (FK a accounts.id).',
    `is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Indica si el tipo está activo; un tipo inactivo no admite aportes nuevos.',

    UNIQUE INDEX `contribution_types_denomination_id_code_key`(`denomination_id`, `code`),
    UNIQUE INDEX `contribution_types_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Tipo de aporte (diezmo, ofrenda, primicia, voto u otros que defina la denominación) y la cuenta de ingreso que alimenta. Ámbito: por denominación. Su categoría determina el comportamiento: solo TITHE entra en la liquidación del diezmo y solo VOW admite promesas de voto.';

-- CreateTable
CREATE TABLE `fund_opening_balances` (
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el registro (FK a congregations.id).',
    `fund_id` INTEGER NOT NULL COMMENT 'Fondo al que corresponde el saldo inicial (FK a funds.id).',
    `year` INTEGER NOT NULL COMMENT 'Año calendario (cuatro dígitos) que abre con este saldo.',
    `amount` DECIMAL(14, 2) NOT NULL COMMENT 'Saldo del fondo en la sede al 1 de enero del año, en la moneda de la denominación (dos decimales).',

    PRIMARY KEY (`congregation_id`, `fund_id`, `year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Saldo con el que un fondo inicia un año en una sede. Ámbito: por sede; uno por sede, fondo y año. Los saldos mensuales no se guardan: se calculan con los movimientos. Lo define tesorería o se arrastra automáticamente al cerrar el periodo de diciembre del año anterior.';

-- CreateTable
CREATE TABLE `accounting_periods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el registro (FK a congregations.id).',
    `year` INTEGER NOT NULL COMMENT 'Año calendario del periodo (cuatro dígitos).',
    `month` INTEGER NOT NULL COMMENT 'Mes del periodo, de 1 (enero) a 12 (diciembre) (regla CHECK).',
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN' COMMENT 'Estado: OPEN (abierto, admite movimientos y aportes) o CLOSED (cerrado, ya no admite registros).',
    `closed_at` DATETIME(3) NULL COMMENT 'Fecha y hora en que se cerró el periodo (UTC); nulo mientras está abierto.',

    UNIQUE INDEX `accounting_periods_congregation_id_year_month_key`(`congregation_id`, `year`, `month`),
    UNIQUE INDEX `accounting_periods_denomination_id_congregation_id_id_key`(`denomination_id`, `congregation_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Periodo contable mensual que controla en qué fechas se registran movimientos y aportes. Ámbito: por sede; uno por sede, año y mes. Un periodo cerrado no admite registros. Se cierra en orden, después de terminar el mes y sin aportes por consolidar; al cerrarlo se abre el siguiente.';

-- CreateTable
CREATE TABLE `vouchers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el registro (FK a congregations.id).',
    `type` VARCHAR(30) NOT NULL COMMENT 'Tipo de comprobante: REC (recibo de aporte), CI (comprobante de ingreso), CE (comprobante de egreso) o LD (liquidación del diezmo).',
    `number` INTEGER NOT NULL COMMENT 'Consecutivo por sede y tipo que nunca se reinicia; el código impreso es TIPO-AÑO-NÚMERO, con el año tomado de la fecha de emisión.',
    `issued_on` DATE NOT NULL COMMENT 'Fecha de emisión (fecha ISO, sin hora); coincide con la fecha del aporte, movimiento o liquidación que respalda.',
    `signer_id` INTEGER NULL COMMENT 'Persona que firma el comprobante; lleva una sola firma y es opcional (FK a persons.id).',
    `voided_at` DATETIME(3) NULL COMMENT 'Fecha y hora de la anulación del comprobante (UTC); nulo si está vigente.',
    `void_reason` VARCHAR(255) NULL COMMENT 'Motivo de la anulación (máx. 255 caracteres); nulo si el comprobante está vigente.',

    UNIQUE INDEX `vouchers_congregation_id_type_number_key`(`congregation_id`, `type`, `number`),
    UNIQUE INDEX `vouchers_denomination_id_congregation_id_id_key`(`denomination_id`, `congregation_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Comprobante numerado que respalda aportes, movimientos de caja y liquidaciones. Ámbito: por sede. Tipos: REC recibo de aporte, CI ingreso (también la consolidación de aportes), CE egreso y LD liquidación del diezmo. No se borra: se anula con motivo.';

-- CreateTable
CREATE TABLE `cash_transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el registro (FK a congregations.id).',
    `period_id` INTEGER NOT NULL COMMENT 'Periodo contable del mes de la fecha del movimiento; debe estar abierto al registrar (FK a accounting_periods.id).',
    `account_id` INTEGER NOT NULL COMMENT 'Cuenta imputable: de ingreso para una entrada y de egreso para una salida; la reversa conserva la cuenta original (FK a accounts.id).',
    `fund_id` INTEGER NOT NULL COMMENT 'Fondo cuyo saldo afecta el movimiento (FK a funds.id).',
    `voucher_id` INTEGER NULL COMMENT 'Comprobante que respalda el movimiento (CI, CE o LD); las líneas de una liquidación comparten su LD (FK a vouchers.id).',
    `direction` ENUM('IN', 'OUT') NOT NULL COMMENT 'Sentido del dinero: IN (entrada, suma al saldo del fondo) u OUT (salida, lo resta); una reversa usa el sentido contrario al original.',
    `posted_on` DATE NOT NULL COMMENT 'Fecha contable del movimiento (fecha ISO, sin hora); no puede ser posterior a hoy y debe caer en un periodo abierto.',
    `amount` DECIMAL(14, 2) NOT NULL COMMENT 'Importe del movimiento en la moneda de la denominación, siempre mayor que cero (regla CHECK, dos decimales).',
    `description` VARCHAR(255) NOT NULL COMMENT 'Descripción del movimiento (de 3 a 255 caracteres); en una reversa incluye el comprobante original y el motivo.',
    `reversal_of_id` INTEGER NULL COMMENT 'Movimiento original que esta línea reversa; nulo si no es una reversa. Cada movimiento admite una sola reversa (FK a cash_transactions.id).',
    `created_by_id` INTEGER NOT NULL COMMENT 'Usuario que registró el movimiento (FK a users.id).',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',

    INDEX `cash_transactions_period_id_posted_on_idx`(`period_id`, `posted_on`),
    INDEX `cash_transactions_account_id_posted_on_idx`(`account_id`, `posted_on`),
    INDEX `cash_transactions_fund_id_posted_on_idx`(`fund_id`, `posted_on`),
    INDEX `cash_transactions_congregation_id_posted_on_idx`(`congregation_id`, `posted_on`),
    UNIQUE INDEX `cash_transactions_denomination_id_congregation_id_id_key`(`denomination_id`, `congregation_id`, `id`),
    UNIQUE INDEX `cash_transactions_denomination_id_congregation_id_reversal_o_key`(`denomination_id`, `congregation_id`, `reversal_of_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Línea del libro de caja, imputada a una cuenta y un fondo dentro de un periodo contable. Ámbito: por sede. El importe siempre es positivo y el sentido lo da la dirección. No se edita ni se borra: se corrige con una reversa (misma cuenta, fondo e importe, sentido contrario). Que la fecha caiga en un periodo abierto se valida en la aplicación.';

-- CreateTable
CREATE TABLE `vow_pledges` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede donde se hizo la promesa y a la que pertenece el registro (FK a congregations.id).',
    `person_id` INTEGER NOT NULL COMMENT 'Persona que hizo la promesa; solo sus propios aportes pueden pagarla (FK a persons.id).',
    `contribution_type_id` INTEGER NOT NULL COMMENT 'Tipo de aporte de categoría VOW con el que se paga la promesa (FK a contribution_types.id).',
    `description` VARCHAR(255) NULL COMMENT 'Observaciones de la promesa (máx. 255 caracteres); opcional.',
    `pledged_amount` DECIMAL(14, 2) NOT NULL COMMENT 'Importe prometido en la moneda de la denominación, mayor que cero (regla CHECK, dos decimales).',
    `pledged_on` DATE NOT NULL COMMENT 'Fecha en que se hizo la promesa (fecha ISO, sin hora).',
    `due_on` DATE NULL COMMENT 'Fecha límite para cumplir la promesa (fecha ISO); opcional y nunca anterior a la fecha de la promesa.',
    `status` ENUM('ACTIVE', 'FULFILLED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE' COMMENT 'Estado: ACTIVE (vigente, con saldo), FULFILLED (los pagos alcanzan lo prometido) o CANCELLED (cancelada, definitiva).',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',

    INDEX `vow_pledges_person_id_status_idx`(`person_id`, `status`),
    INDEX `vow_pledges_congregation_id_status_idx`(`congregation_id`, `status`),
    UNIQUE INDEX `vow_pledges_denomination_id_id_key`(`denomination_id`, `id`),
    UNIQUE INDEX `vow_pledges_denomination_id_person_id_contribution_type_id_i_key`(`denomination_id`, `person_id`, `contribution_type_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Promesa de voto que hace una persona por un importe. Ámbito: por sede donde se hizo la promesa. Sus pagos son aportes que apuntan a ella; lo abonado y el saldo no se guardan, se calculan. Un miembro trasladado puede pagar en su nueva sede un voto hecho en la anterior.';

-- CreateTable
CREATE TABLE `contributions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el registro (FK a congregations.id).',
    `contribution_type_id` INTEGER NOT NULL COMMENT 'Tipo de aporte; su categoría decide si entra en la liquidación del diezmo o si puede pagar un voto (FK a contribution_types.id).',
    `person_id` INTEGER NULL COMMENT 'Persona que hizo el aporte; nulo si es anónimo o una colecta agregada (FK a persons.id).',
    `vow_pledge_id` INTEGER NULL COMMENT 'Promesa de voto que paga este aporte; exige persona y debe coincidir con la promesa en persona y tipo (FK a vow_pledges.id).',
    `cash_transaction_id` INTEGER NULL COMMENT 'Movimiento de caja (CI) que consolidó el aporte; nulo mientras está pendiente y vuelve a nulo si se reversa la consolidación (FK a cash_transactions.id).',
    `voucher_id` INTEGER NULL COMMENT 'Recibo de aporte (comprobante REC) emitido al registrarlo; se anula junto con el aporte (FK a vouchers.id).',
    `tithe_settlement_id` INTEGER NULL COMMENT 'Liquidación del diezmo que incluyó el aporte; nulo si no está liquidado y vuelve a nulo si se anula la liquidación (FK a tithe_settlements.id).',
    `received_on` DATE NOT NULL COMMENT 'Fecha en que se recibió el aporte (fecha ISO, sin hora); no posterior a hoy y dentro de un periodo abierto.',
    `amount` DECIMAL(14, 2) NOT NULL COMMENT 'Importe del aporte en la moneda de la denominación, mayor que cero (regla CHECK, dos decimales).',
    `payment_method` ENUM('CASH', 'BANK_TRANSFER', 'CARD', 'BANK_DEPOSIT', 'OTHER') NOT NULL DEFAULT 'CASH' COMMENT 'Medio de pago: CASH (efectivo), BANK_TRANSFER (transferencia), CARD (datáfono), BANK_DEPOSIT (consignación) u OTHER (otro).',
    `payment_reference` VARCHAR(80) NULL COMMENT 'Referencia bancaria de la operación (máx. 80 caracteres); obligatoria en transferencia, datáfono y consignación.',
    `notes` VARCHAR(255) NULL COMMENT 'Observaciones del aporte (máx. 255 caracteres); opcional.',
    `status` ENUM('RECORDED', 'VOIDED') NOT NULL DEFAULT 'RECORDED' COMMENT 'Estado: RECORDED (registrado y vigente) o VOIDED (anulado, con fecha, usuario y motivo). Que esté liquidado se deduce de la liquidación asociada.',
    `recorded_by_id` INTEGER NOT NULL COMMENT 'Usuario que registró el aporte (FK a users.id).',
    `voided_by_id` INTEGER NULL COMMENT 'Usuario que anuló el aporte; nulo si está vigente (FK a users.id).',
    `voided_at` DATETIME(3) NULL COMMENT 'Fecha y hora de la anulación (UTC); nulo si el aporte está vigente.',
    `void_reason` VARCHAR(255) NULL COMMENT 'Motivo de la anulación (máx. 255 caracteres); nulo si el aporte está vigente.',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',

    INDEX `contributions_congregation_id_received_on_idx`(`congregation_id`, `received_on`),
    INDEX `contributions_congregation_id_contribution_type_id_received__idx`(`congregation_id`, `contribution_type_id`, `received_on`),
    INDEX `contributions_denomination_id_received_on_idx`(`denomination_id`, `received_on`),
    INDEX `contributions_person_id_received_on_idx`(`person_id`, `received_on`),
    INDEX `contributions_vow_pledge_id_idx`(`vow_pledge_id`),
    INDEX `contributions_cash_transaction_id_idx`(`cash_transaction_id`),
    INDEX `contributions_tithe_settlement_id_idx`(`tithe_settlement_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Aporte recibido (diezmo, ofrenda, primicia, pago de voto u otro). Ámbito: por sede. Dato muy sensible: exige permiso específico; no se borra, se anula con motivo. Sin persona es anónimo o una colecta agregada. Nace con su recibo REC y luego se consolida con otros en un movimiento de caja. Un pago de voto es de la misma persona y tipo que la promesa.';

-- CreateTable
CREATE TABLE `tithe_settlement_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `effective_from` DATE NOT NULL COMMENT 'Fecha desde la que rigen los porcentajes (fecha ISO, sin hora); única por denominación.',
    `national_share_rate` DECIMAL(5, 4) NOT NULL COMMENT 'Fracción del diezmo bruto que va a la parte nacional, de 0 a 1 con cuatro decimales (0.2100 = 21 %).',
    `local_fund_rate` DECIMAL(5, 4) NOT NULL COMMENT 'Fracción que va al fondo local, aplicada al bruto menos la parte nacional, de 0 a 1 con cuatro decimales (0.0300 = 3 %).',

    UNIQUE INDEX `tithe_settlement_rules_denomination_id_effective_from_key`(`denomination_id`, `effective_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Porcentajes de liquidación del diezmo con su fecha de vigencia (en las fuentes, 21 % nacional y 3 % fondo local). Ámbito: por denominación. Parte nacional = bruto × tasa nacional; fondo local = (bruto − parte nacional) × tasa local; neto pastoral = el resto. Se redondea a pesos y el residuo va a la parte mayor. Rige la regla de vigencia más reciente que no supere la fecha de la liquidación.';

-- CreateTable
CREATE TABLE `tithe_settlements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el registro (FK a congregations.id).',
    `voucher_id` INTEGER NULL COMMENT 'Comprobante LD de la liquidación, que agrupa sus salidas de caja; único por sede (FK a vouchers.id).',
    `pastor_id` INTEGER NULL COMMENT 'Pastor que recibe el neto pastoral; opcional, hoy la liquidación no lo diligencia (FK a persons.id).',
    `settled_on` DATE NOT NULL COMMENT 'Fecha de la liquidación (fecha ISO, sin hora); también es la fecha contable de sus salidas de caja.',
    `covered_from` DATE NOT NULL COMMENT 'Primer día del rango de diezmos liquidados (fecha ISO, inclusivo); no puede ser posterior al último día (regla CHECK).',
    `covered_to` DATE NOT NULL COMMENT 'Último día del rango de diezmos liquidados (fecha ISO, inclusivo).',
    `gross_tithe` DECIMAL(14, 2) NOT NULL COMMENT 'Diezmo bruto: suma de los diezmos vigentes y aún no liquidados del rango, en la moneda de la denominación.',
    `national_share_rate` DECIMAL(5, 4) NOT NULL COMMENT 'Copia de la fracción nacional vigente al liquidar, de 0 a 1 con cuatro decimales (0.2100 = 21 %).',
    `local_fund_rate` DECIMAL(5, 4) NOT NULL COMMENT 'Copia de la fracción del fondo local vigente al liquidar, de 0 a 1 con cuatro decimales, aplicada al bruto menos la parte nacional.',
    `national_share` DECIMAL(14, 2) NOT NULL COMMENT 'Importe de la parte nacional (bruto × fracción nacional, redondeado a pesos enteros), no negativo; genera una salida de caja en la cuenta 530505.',
    `local_fund_share` DECIMAL(14, 2) NOT NULL COMMENT 'Importe del fondo local ((bruto − parte nacional) × fracción local, redondeado a pesos); queda en la sede y no genera movimiento de caja.',
    `pastor_net` DECIMAL(14, 2) NOT NULL COMMENT 'Neto pastoral: bruto menos parte nacional y fondo local (recibe el residuo del redondeo si es el mayor); los tres suman el bruto (regla CHECK) y genera salida en 530510.',
    `status` ENUM('ISSUED', 'VOIDED') NOT NULL DEFAULT 'ISSUED' COMMENT 'Estado: ISSUED (emitida y vigente) o VOIDED (anulada: reversa sus salidas de caja, anula el LD y libera los diezmos).',
    `voided_by_id` INTEGER NULL COMMENT 'Usuario que anuló la liquidación; nulo si está vigente (FK a users.id).',
    `voided_at` DATETIME(3) NULL COMMENT 'Fecha y hora de la anulación (UTC); nulo si la liquidación está vigente.',
    `void_reason` VARCHAR(255) NULL COMMENT 'Motivo de la anulación (máx. 255 caracteres); nulo si la liquidación está vigente.',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',

    INDEX `tithe_settlements_congregation_id_settled_on_idx`(`congregation_id`, `settled_on`),
    INDEX `tithe_settlements_congregation_id_covered_from_covered_to_idx`(`congregation_id`, `covered_from`, `covered_to`),
    UNIQUE INDEX `tithe_settlements_denomination_id_congregation_id_id_key`(`denomination_id`, `congregation_id`, `id`),
    UNIQUE INDEX `tithe_settlements_denomination_id_congregation_id_voucher_id_key`(`denomination_id`, `congregation_id`, `voucher_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Liquidación del diezmo de un rango de fechas: reparte el bruto entre parte nacional, fondo local y neto pastoral. Ámbito: por sede. Copia porcentajes e importes para que un cambio futuro no altere el pasado; emite un comprobante LD con sus salidas de caja. Los diezmos liquidados apuntan aquí. Que los rangos no se solapen se valida en la aplicación.';

-- CreateTable
CREATE TABLE `budgets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el registro (FK a congregations.id).',
    `year` INTEGER NOT NULL COMMENT 'Año calendario del presupuesto (cuatro dígitos).',
    `type` ENUM('FIXED', 'COMMITTEE') NOT NULL COMMENT 'Tipo: FIXED (presupuesto fijo) o COMMITTEE (presupuesto por comités, donde el fondo de cada línea es el comité).',
    `income_increase_rate` DECIMAL(5, 4) NULL COMMENT 'Incremento esperado de los ingresos como fracción de 0 a 1 con cuatro decimales (0.0500 = 5 %); nulo si no se definió.',
    `status` ENUM('DRAFT', 'APPROVED', 'CLOSED') NOT NULL DEFAULT 'DRAFT' COMMENT 'Estado: DRAFT (borrador), APPROVED (aprobado, exige al menos una línea y puede volver a borrador) o CLOSED (cerrado, definitivo); solo el cerrado bloquea cambios.',

    UNIQUE INDEX `budgets_congregation_id_year_type_key`(`congregation_id`, `year`, `type`),
    UNIQUE INDEX `budgets_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Presupuesto anual, fijo o por comités, como en los Excel. Ámbito: por sede; uno por sede, año y tipo. Pasa de borrador a aprobado (puede volver a borrador) y de aprobado a cerrado; un presupuesto cerrado es definitivo y no admite cambios.';

-- CreateTable
CREATE TABLE `budget_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `budget_id` INTEGER NOT NULL COMMENT 'Presupuesto al que pertenece la línea (FK a budgets.id).',
    `account_id` INTEGER NOT NULL COMMENT 'Cuenta imputable presupuestada (FK a accounts.id).',
    `fund_id` INTEGER NOT NULL COMMENT 'Fondo de la línea; en el presupuesto por comités, el comité (FK a funds.id).',
    `monthly_amount` DECIMAL(14, 2) NULL COMMENT 'Valor mensual planeado en la moneda de la denominación; opcional y no mayor que el anual. Si falta, la ejecución usa el anual entre 12.',
    `annual_amount` DECIMAL(14, 2) NOT NULL COMMENT 'Valor anual planeado en la moneda de la denominación (dos decimales); la base exige que no sea negativo y la aplicación, que sea mayor que cero.',

    UNIQUE INDEX `budget_lines_budget_id_account_id_fund_id_key`(`budget_id`, `account_id`, `fund_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Línea de un presupuesto: lo planeado en el año para una cuenta y un fondo. Ámbito: por sede, a través de su presupuesto; una por presupuesto, cuenta y fondo. El valor mensual es opcional: algunos conceptos de los Excel no son 12 veces el valor mensual.';

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `email` VARCHAR(191) NOT NULL COMMENT 'Correo electrónico de inicio de sesión, único en toda la plataforma; se guarda recortado y en minúsculas.',
    `password_hash` VARCHAR(255) NOT NULL COMMENT 'Hash autodescriptivo de la contraseña (scrypt con coste y sal); un valor inutilizable marca una cuenta invitada sin contraseña aún.',
    `display_name` VARCHAR(150) NULL COMMENT 'Nombre visible de la cuenta en la interfaz; si es nulo se muestra el correo.',
    `is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Indica si la cuenta está activa; si es falso no puede iniciar sesión ni aceptar invitaciones.',
    `email_verified_at` DATETIME(3) NULL COMMENT 'Fecha y hora en que se confirmó el correo (UTC); nulo si aún no se ha verificado.',
    `last_login_at` DATETIME(3) NULL COMMENT 'Fecha y hora del último inicio de sesión exitoso (UTC); nulo si nunca ha ingresado.',
    `failed_login_attempts` INTEGER NOT NULL DEFAULT 0 COMMENT 'Intentos fallidos consecutivos de inicio de sesión; al llegar a 5 bloquea la cuenta y vuelve a 0, igual que tras un ingreso exitoso o un cambio de contraseña.',
    `locked_until` DATETIME(3) NULL COMMENT 'Fecha y hora hasta la que la cuenta está bloqueada por intentos fallidos (UTC, 15 minutos); nulo si no está bloqueada.',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',
    `updated_at` DATETIME(3) NOT NULL COMMENT 'Fecha y hora de la última modificación (UTC).',
    `deleted_at` DATETIME(3) NULL COMMENT 'Fecha y hora del borrado lógico (UTC); nulo si el registro está vigente.',

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Cuenta de acceso de una persona al sistema: credenciales, verificación de correo y control de bloqueo. Ámbito global: una misma cuenta puede tener roles en varias denominaciones o sedes mediante user_roles. Admite borrado lógico.';

-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `code` VARCHAR(50) NOT NULL COMMENT 'Código estable y único del rol que usa la aplicación, p. ej. PASTOR o TREASURER.',
    `name` VARCHAR(100) NOT NULL COMMENT 'Nombre legible del rol en español, p. ej. Tesorero(a).',
    `description` VARCHAR(255) NULL COMMENT 'Descripción opcional del rol.',
    `is_system` BOOLEAN NOT NULL DEFAULT false COMMENT 'Indica si el rol es de sistema (lo crea el seed con valor verdadero); hoy no existe alta de roles desde la aplicación, por lo que todos son de sistema.',

    UNIQUE INDEX `roles_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Catálogo global de roles: PLATFORM_ADMIN, DENOMINATION_ADMIN, PASTOR, SECRETARY y TREASURER. Cada rol agrupa permisos vía role_permissions y se asigna a usuarios con un alcance en user_roles. Lo siembra el seed.';

-- CreateTable
CREATE TABLE `permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `code` VARCHAR(80) NOT NULL COMMENT 'Código único del permiso en formato «recurso.acción», p. ej. members.write o audit-logs.read.',
    `description` VARCHAR(255) NULL COMMENT 'Descripción opcional del permiso.',

    UNIQUE INDEX `permissions_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Catálogo global de permisos granulares en formato «recurso.acción», p. ej. members.read. Lo siembra el seed y se asocia a los roles mediante role_permissions.';

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` INTEGER NOT NULL COMMENT 'Rol que recibe el permiso (FK a roles.id).',
    `permission_id` INTEGER NOT NULL COMMENT 'Permiso concedido al rol (FK a permissions.id).',

    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Tabla puente que concede permisos a roles (muchos a muchos); la clave primaria es el par rol y permiso. Ámbito global; el seed la sincroniza con el código y retira los permisos que ya no tiene el rol.';

-- CreateTable
CREATE TABLE `user_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `user_id` INTEGER NOT NULL COMMENT 'Usuario que recibe el rol (FK a users.id).',
    `role_id` INTEGER NOT NULL COMMENT 'Rol asignado (FK a roles.id).',
    `scope` ENUM('PLATFORM', 'DENOMINATION', 'CONGREGATION') NOT NULL COMMENT 'Alcance del rol: PLATFORM (toda la plataforma), DENOMINATION (una denominación) o CONGREGATION (una sede).',
    `denomination_id` INTEGER NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias. Nula solo con alcance PLATFORM (FK a denominations.id).',
    `congregation_id` INTEGER NULL COMMENT 'Sede a la que pertenece el registro; solo se informa con alcance CONGREGATION y debe ser de la misma denominación (FK compuesta a congregations.id).',
    `scope_key` VARCHAR(40) NOT NULL COMMENT 'Clave de unicidad del alcance, porque un índice único admite varios NULL: «P», «D:<denominationId>» o «C:<congregationId>».',
    `active_key` BOOLEAN NULL DEFAULT true COMMENT 'Marca de vigencia para la unicidad: 1 mientras el rol está vigente y nulo al revocarlo, para poder concederlo de nuevo.',
    `granted_by_id` INTEGER NULL COMMENT 'Usuario que concedió el rol; nulo si lo asignó el sistema (registro público de sede o consola) (FK a users.id).',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC); equivale a la fecha de concesión del rol.',
    `revoked_at` DATETIME(3) NULL COMMENT 'Fecha y hora de revocación del rol (UTC); nulo mientras está vigente.',

    INDEX `user_roles_denomination_id_congregation_id_idx`(`denomination_id`, `congregation_id`),
    UNIQUE INDEX `user_roles_user_id_role_id_scope_key_active_key_key`(`user_id`, `role_id`, `scope_key`, `active_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Asignación de un rol a un usuario con su alcance: toda la plataforma, una denominación o una sede. Un usuario puede tener varias. La revocación es lógica (revoked_at). La coherencia entre alcance, scope_key y active_key se exige con CHECK en sql/constraints.sql.';

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `user_id` INTEGER NOT NULL COMMENT 'Usuario dueño de la sesión (FK a users.id).',
    `family` VARCHAR(36) NOT NULL COMMENT 'UUID de la sesión (sid del token de acceso) que agrupa todas las rotaciones del token de renovación.',
    `token_hash` VARCHAR(128) NOT NULL COMMENT 'Hash SHA-256 en hexadecimal (64 caracteres) del token opaco; el token en claro nunca se almacena.',
    `expires_at` DATETIME(3) NOT NULL COMMENT 'Fecha y hora de vencimiento del token (UTC), según REFRESH_TTL (7 días por defecto).',
    `revoked_at` DATETIME(3) NULL COMMENT 'Fecha y hora de revocación (UTC): rotación, cierre de sesión, reutilización, tope de duración, cambio de contraseña o cuenta sin acceso; nulo si sigue activo.',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC); la más antigua de la familia marca el inicio de la sesión.',

    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_user_id_idx`(`user_id`),
    INDEX `refresh_tokens_family_idx`(`family`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Token de renovación de sesión: una fila por cada rotación. Las filas con la misma family forman una sesión. Reusar un token ya rotado, pasados 10 s de gracia, revoca toda la familia; la sesión vence a los REFRESH_MAX_LIFETIME. Ámbito global por usuario; solo se guarda el hash.';

-- CreateTable
CREATE TABLE `user_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `user_id` INTEGER NOT NULL COMMENT 'Usuario al que pertenece el token (FK a users.id).',
    `type` ENUM('EMAIL_VERIFICATION', 'PASSWORD_RESET') NOT NULL COMMENT 'Propósito: EMAIL_VERIFICATION (confirmar correo o aceptar invitación) o PASSWORD_RESET (restablecer la contraseña).',
    `token_hash` VARCHAR(128) NOT NULL COMMENT 'Hash SHA-256 en hexadecimal (64 caracteres) del token del enlace; el token en claro nunca se almacena.',
    `expires_at` DATETIME(3) NOT NULL COMMENT 'Vencimiento del enlace (UTC): 72 h verificación o invitación; restablecimiento 30 min si lo pide el usuario o 24 h si lo emite un administrador.',
    `used_at` DATETIME(3) NULL COMMENT 'Fecha y hora en que el token dejó de ser válido (UTC): se usó o fue invalidado al emitirse uno nuevo o completarse el flujo; nulo si sigue pendiente.',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',

    UNIQUE INDEX `user_tokens_token_hash_key`(`token_hash`),
    INDEX `user_tokens_user_id_type_idx`(`user_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Token de un solo uso de un enlace para verificar el correo, aceptar una invitación o recuperar la contraseña; se envía por correo o lo entrega un administrador. Ámbito global por usuario; solo se guarda el hash del enlace.';

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `user_id` INTEGER NULL COMMENT 'Usuario que realizó la acción; nulo si fue anónima o del sistema. Referencia lógica a users.id, sin FK.',
    `denomination_id` INTEGER NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias. Nula en acciones sin denominación. Referencia lógica a denominations.id, sin FK.',
    `congregation_id` INTEGER NULL COMMENT 'Sede a la que pertenece el registro; nula si la acción no es de una sede. Referencia lógica a congregations.id, sin FK.',
    `entity` VARCHAR(80) NOT NULL COMMENT 'Nombre del modelo afectado, p. ej. User, Congregation o Certificate.',
    `entity_id` VARCHAR(40) NOT NULL COMMENT 'Identificador de la fila afectada, guardado como texto.',
    `action` VARCHAR(40) NOT NULL COMMENT 'Verbo de la acción en mayúsculas con guion bajo, p. ej. LOGIN, FUND_CREATED o CERTIFICATE_ISSUED.',
    `changes` JSON NULL COMMENT 'Diferencias en JSON con forma {campo: {from, to}}, solo de campos no sensibles; nulo si la acción no cambia datos.',
    `ip_address` VARCHAR(45) NULL COMMENT 'Dirección IPv4 o IPv6 desde la que se hizo la petición; nula si no se conoce.',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',

    INDEX `audit_logs_denomination_id_entity_entity_id_idx`(`denomination_id`, `entity`, `entity_id`),
    INDEX `audit_logs_denomination_id_created_at_idx`(`denomination_id`, `created_at`),
    INDEX `audit_logs_congregation_id_created_at_idx`(`congregation_id`, `created_at`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Bitácora de auditoría de solo inserción: una fila por acción relevante (quién, sobre qué entidad y qué cambió). Se filtra por denominación y sede. Sin FK para que sobreviva a cambios en usuarios, denominaciones o sedes. changes nunca guarda datos personales.';

-- CreateTable
CREATE TABLE `document_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `code` VARCHAR(10) NOT NULL COMMENT 'Código único del tipo de documento: RC, TI, CC, CE, PAS, NUIP, o UNKNOWN para registros importados sin tipo conocido.',
    `name` VARCHAR(80) NOT NULL COMMENT 'Nombre del tipo de documento que se muestra al usuario.',

    UNIQUE INDEX `document_types_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Catálogo global de tipos de documento de identidad (registro civil, tarjeta de identidad, cédula, pasaporte, etc.). Lo carga el seed y lo comparten todas las denominaciones.';

-- CreateTable
CREATE TABLE `marital_statuses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `code` VARCHAR(20) NOT NULL COMMENT 'Código único del estado civil: SINGLE, MARRIED, COMMON_LAW, SEPARATED, DIVORCED o WIDOWED.',
    `name` VARCHAR(80) NOT NULL COMMENT 'Nombre del estado civil que se muestra al usuario.',

    UNIQUE INDEX `marital_statuses_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Catálogo global de estados civiles de una persona. Lo carga el seed y es común a todas las denominaciones.';

-- CreateTable
CREATE TABLE `education_levels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `code` VARCHAR(20) NOT NULL COMMENT 'Código único del nivel: NONE, PRIMARY, SECONDARY, TECHNICAL, TECHNOLOGIST, UNIVERSITY o POSTGRADUATE.',
    `name` VARCHAR(80) NOT NULL COMMENT 'Nombre del nivel educativo que se muestra al usuario.',

    UNIQUE INDEX `education_levels_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Catálogo global de niveles educativos de una persona. Lo carga el seed y es común a todas las denominaciones.';

-- CreateTable
CREATE TABLE `study_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `code` VARCHAR(30) NOT NULL COMMENT 'Código único del tipo: COURSE, TECHNICAL, UNIVERSITY, INITIAL, THEOLOGICAL, CHRISTIAN_EDUCATION u OTHER.',
    `name` VARCHAR(80) NOT NULL COMMENT 'Nombre del tipo de estudio que se muestra al usuario.',

    UNIQUE INDEX `study_types_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Catálogo global de tipos de estudio. Unifica las tablas del diccionario de origen: cursos, técnicos, universitarios, iniciales, teológicos y educación cristiana (C 101 a C 401). Lo carga el seed.';

-- CreateTable
CREATE TABLE `pastoral_ranks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `name` VARCHAR(80) NOT NULL COMMENT 'Nombre del grado pastoral, único dentro de la denominación.',
    `is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Indica si el grado está activo y disponible para asignarse a miembros.',

    UNIQUE INDEX `pastoral_ranks_denomination_id_name_key`(`denomination_id`, `name`),
    UNIQUE INDEX `pastoral_ranks_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Grado pastoral que cada denominación define y asigna a los miembros que ejercen el ministerio. Ámbito: por denominación; el nombre es único dentro de ella.';

-- CreateTable
CREATE TABLE `studies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `study_type_id` INTEGER NOT NULL COMMENT 'Tipo de estudio al que pertenece (FK a study_types.id).',
    `name` VARCHAR(150) NOT NULL COMMENT 'Nombre del estudio o programa, único por tipo dentro de la denominación.',
    `is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Indica si el estudio está activo y disponible para registrarse en las personas.',

    UNIQUE INDEX `studies_denomination_id_study_type_id_name_key`(`denomination_id`, `study_type_id`, `name`),
    UNIQUE INDEX `studies_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Estudio concreto (curso, carrera o programa) del catálogo de cada denominación, clasificado por tipo de estudio. Ámbito: por denominación; el nombre es único por tipo.';

-- CreateTable
CREATE TABLE `church_positions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `name` VARCHAR(120) NOT NULL COMMENT 'Nombre del cargo, único dentro de la denominación.',
    `is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Indica si el cargo está activo y disponible para asignarse a miembros.',

    UNIQUE INDEX `church_positions_denomination_id_name_key`(`denomination_id`, `name`),
    UNIQUE INDEX `church_positions_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Cargo dentro de la iglesia que cada denominación define; los miembros lo ocupan a través de member_positions. Ámbito: por denominación; el nombre es único dentro de ella.';

-- CreateTable
CREATE TABLE `persons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `user_id` INTEGER NULL COMMENT 'Cuenta de usuario vinculada si la persona accede al sistema; a lo sumo una persona por cuenta y denominación (FK a users.id).',
    `document_type_id` INTEGER NULL COMMENT 'Tipo de documento de identidad; nulo solo si tampoco hay número (CHECK) (FK a document_types.id).',
    `document_number` VARCHAR(30) NULL COMMENT 'Número de documento normalizado: sin puntos, espacios ni guiones y en mayúsculas; único por tipo en la denominación.',
    `document_issue_place_id` INTEGER NULL COMMENT 'Municipio de expedición del documento, cuando se identifica en el catálogo (FK a municipalities.id).',
    `document_issue_place_text` VARCHAR(150) NULL COMMENT 'Lugar de expedición del documento en texto libre, cuando no se pudo identificar en el catálogo de municipios.',
    `full_name` VARCHAR(200) NULL COMMENT 'Nombre completo en una sola cadena, para parientes de los que las fuentes solo traen el nombre en una celda; si hay nombres y apellidos, prevalecen.',
    `first_name` VARCHAR(100) NULL COMMENT 'Nombres de pila de la persona.',
    `last_name` VARCHAR(80) NULL COMMENT 'Primer apellido de la persona.',
    `second_last_name` VARCHAR(80) NULL COMMENT 'Segundo apellido de la persona; opcional.',
    `sex` ENUM('FEMALE', 'MALE') NULL COMMENT 'Sexo de la persona: FEMALE (femenino) o MALE (masculino); nulo si no se conoce.',
    `birth_date` DATE NULL COMMENT 'Fecha de nacimiento (fecha ISO, sin hora); define la edad y si la persona es menor de 18 años.',
    `birth_place_id` INTEGER NULL COMMENT 'Municipio de nacimiento, cuando se identifica en el catálogo (FK a municipalities.id).',
    `birth_place_text` VARCHAR(150) NULL COMMENT 'Lugar de nacimiento en texto libre, cuando no se pudo identificar en el catálogo de municipios.',
    `marital_status_id` INTEGER NULL COMMENT 'Estado civil de la persona (FK a marital_statuses.id).',
    `education_level_id` INTEGER NULL COMMENT 'Nivel educativo alcanzado por la persona (FK a education_levels.id).',
    `last_grade_completed` INTEGER NULL COMMENT 'Último grado escolar aprobado, como número entero; nulo si no se conoce.',
    `profession` VARCHAR(120) NULL COMMENT 'Profesión u oficio para el que se formó la persona, en texto libre.',
    `occupation` VARCHAR(120) NULL COMMENT 'Ocupación o actividad que la persona ejerce actualmente, en texto libre.',
    `workplace` VARCHAR(150) NULL COMMENT 'Lugar o empresa donde trabaja la persona, en texto libre.',
    `children_count` INTEGER NULL COMMENT 'Número de hijos declarado por la persona.',
    `photo_path` VARCHAR(255) NULL COMMENT 'Ruta de la foto de la persona en el almacenamiento de archivos; nula si no tiene foto.',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',
    `updated_at` DATETIME(3) NOT NULL COMMENT 'Fecha y hora de la última modificación (UTC).',
    `deleted_at` DATETIME(3) NULL COMMENT 'Fecha y hora del borrado lógico (UTC); nulo si el registro está vigente.',

    INDEX `persons_denomination_id_document_number_idx`(`denomination_id`, `document_number`),
    INDEX `persons_denomination_id_last_name_first_name_idx`(`denomination_id`, `last_name`, `first_name`),
    INDEX `persons_denomination_id_birth_date_idx`(`denomination_id`, `birth_date`),
    UNIQUE INDEX `persons_denomination_id_id_key`(`denomination_id`, `id`),
    UNIQUE INDEX `persons_denomination_id_document_type_id_document_number_key`(`denomination_id`, `document_type_id`, `document_number`),
    UNIQUE INDEX `persons_denomination_id_user_id_key`(`denomination_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Persona conocida por una denominación: miembro, pariente, acudiente, pastor o aportante. Ámbito: por denominación. Tipo y número de documento van juntos (CHECK chk_persons_document) y son únicos en la denominación. Los campos «Text» guardan lugares que no se pueden identificar en el catálogo de municipios.';

-- CreateTable
CREATE TABLE `person_addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `person_id` INTEGER NOT NULL COMMENT 'Persona a la que pertenece la dirección (FK a persons.id).',
    `municipality_id` INTEGER NULL COMMENT 'Municipio de la dirección (FK a municipalities.id).',
    `neighborhood_id` INTEGER NULL COMMENT 'Barrio de la dirección, cuando está en el catálogo (FK a neighborhoods.id).',
    `address` VARCHAR(200) NOT NULL COMMENT 'Dirección escrita (calle, número y complemento); puede quedar vacía si solo se conoce el municipio.',
    `is_current` BOOLEAN NOT NULL DEFAULT true COMMENT 'Indica si es la dirección vigente de la persona; la aplicación consulta y edita solo la vigente.',

    INDEX `person_addresses_person_id_is_current_idx`(`person_id`, `is_current`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Dirección de residencia de una persona; la vigente se marca con is_current. Se borra al anonimizar la persona. Ámbito: por denominación.';

-- CreateTable
CREATE TABLE `person_contacts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `person_id` INTEGER NOT NULL COMMENT 'Persona a la que pertenece el contacto (FK a persons.id).',
    `type` ENUM('LANDLINE', 'MOBILE', 'EMAIL', 'WORK_PHONE') NOT NULL COMMENT 'Tipo de contacto: LANDLINE (teléfono fijo), MOBILE (celular), EMAIL (correo electrónico) o WORK_PHONE (teléfono del trabajo).',
    `value` VARCHAR(191) NOT NULL COMMENT 'Número de teléfono o dirección de correo según el tipo; el correo se guarda en minúsculas.',
    `is_primary` BOOLEAN NOT NULL DEFAULT false COMMENT 'Indica si es el contacto principal de la persona; se muestra primero.',

    INDEX `person_contacts_person_id_type_idx`(`person_id`, `type`),
    INDEX `person_contacts_denomination_id_value_idx`(`denomination_id`, `value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Medio de contacto de una persona (teléfono o correo); puede tener varios y uno marcado como principal. Se borra al anonimizar la persona. Ámbito: por denominación.';

-- CreateTable
CREATE TABLE `socioeconomic_profiles` (
    `person_id` INTEGER NOT NULL COMMENT 'Persona dueña de la ficha; es también la clave primaria (FK a persons.id).',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `has_health_coverage` BOOLEAN NULL COMMENT 'Indica si la persona está afiliada al sistema de salud; nulo si no se sabe.',
    `has_pension` BOOLEAN NULL COMMENT 'Indica si la persona está afiliada a un fondo de pensiones; nulo si no se sabe.',
    `has_occupational_risk_coverage` BOOLEAN NULL COMMENT 'Indica si la persona está afiliada a riesgos laborales; nulo si no se sabe.',
    `is_subsidized_regime` BOOLEAN NULL COMMENT 'Indica si la persona pertenece al régimen subsidiado de salud; nulo si no se sabe.',
    `has_family_compensation` BOOLEAN NULL COMMENT 'Indica si la persona está afiliada a una caja de compensación familiar; nulo si no se sabe.',
    `sisben_level` INTEGER NULL COMMENT 'Nivel del SISBÉN, entero de 1 a 6 validado por la aplicación; nulo si no se conoce.',
    `is_displaced` BOOLEAN NULL COMMENT 'Indica si la persona pertenece a población desplazada; nulo si no se sabe.',
    `updated_at` DATETIME(3) NOT NULL COMMENT 'Fecha y hora de la última modificación (UTC).',

    UNIQUE INDEX `socioeconomic_profiles_denomination_id_person_id_key`(`denomination_id`, `person_id`),
    PRIMARY KEY (`person_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Ficha socioeconómica de una persona (una por persona), separada de persons para exigir un permiso específico. Son afiliaciones SÍ/NO, no datos médicos; nulo significa sin respuesta. Se borra al anonimizar. Ámbito: por denominación.';

-- CreateTable
CREATE TABLE `family_relations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `person_id` INTEGER NOT NULL COMMENT 'Persona de la que se registra el parentesco (FK a persons.id).',
    `relative_id` INTEGER NOT NULL COMMENT 'Pariente relacionado; distinto de person_id por la regla CHECK chk_family_relations_people (FK a persons.id).',
    `type` ENUM('FATHER', 'MOTHER', 'CHILD', 'GUARDIAN') NOT NULL COMMENT 'Qué es el pariente para la persona: FATHER (padre), MOTHER (madre), CHILD (hijo o hija) o GUARDIAN (acudiente o tutor).',

    UNIQUE INDEX `family_relations_person_id_relative_id_type_key`(`person_id`, `relative_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Parentesco entre dos personas de la misma denominación: type dice qué es el pariente para la persona. Padre o madre se guardan también en sentido inverso (CHILD); el acudiente no. El cónyuge vive en marriages.';

-- CreateTable
CREATE TABLE `person_studies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `person_id` INTEGER NOT NULL COMMENT 'Persona que realizó o cursa el estudio (FK a persons.id).',
    `study_id` INTEGER NOT NULL COMMENT 'Estudio del catálogo de la denominación (FK a studies.id).',
    `status` ENUM('IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'COMPLETED' COMMENT 'Estado del estudio: IN_PROGRESS (en curso) o COMPLETED (terminado, valor por defecto).',
    `completed_on` DATE NULL COMMENT 'Fecha de terminación del estudio (fecha ISO, sin hora); nula si sigue en curso o no se conoce.',
    `institution` VARCHAR(150) NULL COMMENT 'Institución donde se cursó el estudio, en texto libre (hasta 150 caracteres).',
    `year` INTEGER NULL COMMENT 'Año de finalización o, si sigue en curso, año de inicio; entre 1900 y 2200 (CHECK chk_person_studies_year).',

    UNIQUE INDEX `person_studies_person_id_study_id_key`(`person_id`, `study_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Estudio realizado o en curso de una persona, tomado del catálogo de estudios de su denominación. Cada estudio se registra una sola vez por persona. Ámbito: por denominación.';

-- CreateTable
CREATE TABLE `members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `person_id` INTEGER NOT NULL COMMENT 'Persona que es miembro; única, porque una persona tiene a lo sumo un registro de membresía (FK a persons.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede actual del miembro; cambia con un traslado interno (FK a congregations.id).',
    `status` ENUM('ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED') NOT NULL DEFAULT 'ACTIVE' COMMENT 'Estado: ACTIVE (activo), INACTIVE (inactivo), TRANSFERRED (trasladado a una iglesia fuera del sistema) o DECEASED (fallecido, definitivo).',
    `joined_on` DATE NULL COMMENT 'Fecha de ingreso como miembro (fecha ISO); al aprobar una solicitud es el día de la aprobación.',
    `converted_on` DATE NULL COMMENT 'Fecha de conversión a la fe (fecha ISO); nula si no se conoce.',
    `is_baptized` BOOLEAN NULL COMMENT 'Indica si fue bautizado en agua; nulo significa desconocido, porque los formularios marcan el bautizo sin dar siempre la fecha.',
    `water_baptism_on` DATE NULL COMMENT 'Fecha del bautismo en agua (fecha ISO); nula si no se conoce.',
    `baptism_place` VARCHAR(150) NULL COMMENT 'Lugar o iglesia donde fue bautizado, en texto libre.',
    `baptizing_pastor_id` INTEGER NULL COMMENT 'Pastor que realizó el bautismo, registrado como persona (FK a persons.id).',
    `holy_spirit_baptism_on` DATE NULL COMMENT 'Fecha del bautismo en el Espíritu Santo (fecha ISO); nula si no se conoce.',
    `reconciled_on` DATE NULL COMMENT 'Fecha de reconciliación con la iglesia tras haberse apartado (fecha ISO); nula si no aplica.',
    `previous_congregation_name` VARCHAR(150) NULL COMMENT 'Nombre de la iglesia de procedencia en texto libre, si el miembro venía de otra congregación.',
    `pastoral_rank_id` INTEGER NULL COMMENT 'Grado pastoral del miembro, si ejerce el ministerio (FK a pastoral_ranks.id).',
    `is_christian_education_teacher` BOOLEAN NOT NULL DEFAULT false COMMENT 'Indica si el miembro es maestro de educación cristiana.',
    `desired_areas` VARCHAR(255) NULL COMMENT 'Campos o áreas de servicio en los que desea participar, según el formulario; se borra al anonimizar.',
    `pastor_notes` TEXT NULL COMMENT 'Observaciones confidenciales del pastor; acceso restringido y se borran al anonimizar.',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',
    `updated_at` DATETIME(3) NOT NULL COMMENT 'Fecha y hora de la última modificación (UTC).',
    `deleted_at` DATETIME(3) NULL COMMENT 'Fecha y hora del borrado lógico (UTC); nulo si el registro está vigente.',

    UNIQUE INDEX `members_person_id_key`(`person_id`),
    INDEX `members_congregation_id_status_idx`(`congregation_id`, `status`),
    UNIQUE INDEX `members_denomination_id_id_key`(`denomination_id`, `id`),
    UNIQUE INDEX `members_denomination_id_person_id_key`(`denomination_id`, `person_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Membresía de una persona en la denominación: estado, sede actual y datos espirituales. Una persona tiene a lo sumo un miembro. congregation_id es la sede actual; el registro de cada sede (número, libro y folio) vive en member_registry_entries. Ámbito: por denominación y sede.';

-- CreateTable
CREATE TABLE `member_registry_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `member_id` INTEGER NOT NULL COMMENT 'Miembro registrado (FK a members.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el registro (FK a congregations.id).',
    `member_number` INTEGER NOT NULL COMMENT 'Número de miembro consecutivo de la sede, asignado con document_sequences; único por sede y se muestra como código de sede y número (SC-0130).',
    `legacy_code` INTEGER NULL COMMENT 'Código del miembro en la columna CÓDIGO de los Excel de origen; único por sede y nulo en registros creados en el sistema.',
    `registry_book` VARCHAR(20) NULL COMMENT 'Libro físico de registro de la secretaría; al aprobar una solicitud se sugiere a razón de 100 miembros por libro y es editable; nulo en entradas abiertas por traslado o reactivación.',
    `registry_folio` VARCHAR(20) NULL COMMENT 'Folio dentro del libro de registro; se sugiere a partir del número de miembro y es editable; nulo en entradas abiertas por traslado o reactivación.',
    `started_on` DATE NOT NULL COMMENT 'Fecha de inicio del registro en la sede (fecha ISO): ingreso, traslado interno o reactivación del miembro.',
    `ended_on` DATE NULL COMMENT 'Fecha de cierre del registro en la sede (fecha ISO): por traslado interno o externo o por fallecimiento; nula en la entrada vigente.',

    INDEX `member_registry_entries_member_id_idx`(`member_id`),
    INDEX `member_registry_entries_congregation_id_registry_book_regist_idx`(`congregation_id`, `registry_book`, `registry_folio`),
    UNIQUE INDEX `member_registry_entries_congregation_id_member_number_key`(`congregation_id`, `member_number`),
    UNIQUE INDEX `member_registry_entries_congregation_id_legacy_code_key`(`congregation_id`, `legacy_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Registro del miembro en una sede: número de carné, libro y folio. Un traslado interno cierra la entrada vigente y abre otra en la sede destino; la reactivación sin entrada abierta abre una nueva. Libro y folio no son únicos: los históricos se calculaban con la cédula. Ámbito: por sede.';

-- CreateTable
CREATE TABLE `member_status_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `member_id` INTEGER NOT NULL COMMENT 'Miembro cuyo estado cambió (FK a members.id).',
    `user_id` INTEGER NULL COMMENT 'Usuario que registró el cambio de estado; nulo si no se conoce (FK a users.id).',
    `status` ENUM('ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED') NOT NULL COMMENT 'Estado que tomó el miembro: ACTIVE (activo), INACTIVE (inactivo), TRANSFERRED (trasladado) o DECEASED (fallecido).',
    `started_on` DATE NOT NULL COMMENT 'Fecha desde la que rige el estado (fecha ISO).',
    `reason` VARCHAR(255) NULL COMMENT 'Motivo del cambio de estado en texto libre, por ejemplo el ingreso por solicitud o el traslado a otra iglesia.',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',

    INDEX `member_status_history_member_id_started_on_idx`(`member_id`, `started_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Historial de estados de un miembro: una fila por cada estado que tomó, con la fecha desde la que rige y el motivo. Ámbito: por denominación.';

-- CreateTable
CREATE TABLE `member_transfers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `member_id` INTEGER NOT NULL COMMENT 'Miembro trasladado (FK a members.id).',
    `origin_congregation_id` INTEGER NOT NULL COMMENT 'Sede de la que sale el miembro (FK a congregations.id).',
    `destination_congregation_id` INTEGER NULL COMMENT 'Sede destino de un traslado interno, distinta del origen (CHECK); nula si el destino es externo (FK a congregations.id).',
    `external_destination_name` VARCHAR(150) NULL COMMENT 'Nombre de la iglesia destino fuera del sistema (3 a 150 caracteres); obligatorio si no hay sede destino (CHECK).',
    `status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED' COMMENT 'Estado: REQUESTED (solicitado), APPROVED (aprobado), REJECTED (rechazado), COMPLETED (realizado) o CANCELLED (cancelado); hoy se guarda COMPLETED.',
    `transfer_date` DATE NOT NULL COMMENT 'Fecha efectiva del traslado (fecha ISO); no puede ser futura ni anterior al registro vigente en la sede de origen.',
    `approved_by_id` INTEGER NULL COMMENT 'Usuario que aprobó y registró el traslado (FK a users.id).',
    `approved_at` DATETIME(3) NULL COMMENT 'Fecha y hora de aprobación del traslado (UTC).',
    `certificate_id` INTEGER NULL COMMENT 'Carta de traslado emitida para este traslado, si existe (FK a certificates.id).',
    `notes` VARCHAR(255) NULL COMMENT 'Motivo del traslado indicado por quien lo registra.',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',

    INDEX `member_transfers_member_id_idx`(`member_id`),
    INDEX `member_transfers_destination_congregation_id_status_idx`(`destination_congregation_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Traslado de un miembro a otra sede de la denominación o a una iglesia fuera del sistema (external_destination_name). Entre denominaciones del sistema se crea una persona nueva. La aplicación lo registra ya completado. Ámbito: por denominación.';

-- CreateTable
CREATE TABLE `member_positions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `member_id` INTEGER NOT NULL COMMENT 'Miembro que ocupa el cargo (FK a members.id).',
    `position_id` INTEGER NOT NULL COMMENT 'Cargo ocupado (FK a church_positions.id).',
    `started_on` DATE NULL COMMENT 'Fecha de inicio en el cargo (fecha ISO); nula si no se conoce.',
    `ended_on` DATE NULL COMMENT 'Fecha de fin en el cargo (fecha ISO); nula si sigue vigente. Se cierra sola cuando el miembro pasa a inactivo o fallecido o se traslada a otra iglesia.',

    INDEX `member_positions_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Cargo que ocupa u ocupó un miembro en la iglesia, con su periodo; un cargo sin fecha de fin está vigente. Ámbito: por denominación.';

-- CreateTable
CREATE TABLE `privacy_policies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `version` VARCHAR(20) NOT NULL COMMENT 'Etiqueta de versión de la política (hasta 20 caracteres), única dentro de la denominación.',
    `content` TEXT NOT NULL COMMENT 'Texto completo de la política que acepta el solicitante (50 a 30000 caracteres).',
    `effective_from` DATE NOT NULL COMMENT 'Fecha desde la que rige la política (fecha ISO); una política publicada con fecha futura queda programada.',
    `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT' COMMENT 'Estado: DRAFT (borrador, editable y no visible al público) o PUBLISHED (publicada).',
    `published_at` DATETIME(3) NULL COMMENT 'Fecha y hora de publicación (UTC); presente solo si el estado es PUBLISHED (CHECK chk_privacy_policies_published).',

    UNIQUE INDEX `privacy_policies_denomination_id_version_key`(`denomination_id`, `version`),
    UNIQUE INDEX `privacy_policies_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Política de tratamiento de datos versionada por denominación. Rige la publicada con la fecha de vigencia más reciente ya alcanzada; el borrador no se muestra al público y, sin política vigente, el formulario público se cierra.';

-- CreateTable
CREATE TABLE `data_consents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `person_id` INTEGER NOT NULL COMMENT 'Titular de los datos que otorga la autorización (FK a persons.id).',
    `guardian_id` INTEGER NULL COMMENT 'Acudiente que autoriza en nombre de un menor de 18 años; nulo para adultos (FK a persons.id).',
    `policy_id` INTEGER NOT NULL COMMENT 'Versión de la política de tratamiento aceptada (FK a privacy_policies.id).',
    `channel` ENUM('WEB_FORM', 'PAPER') NOT NULL COMMENT 'Canal de la autorización: WEB_FORM (formulario público de inscripción) o PAPER (formato en papel registrado por la secretaría).',
    `granted_at` DATETIME(3) NOT NULL COMMENT 'Fecha y hora en que se otorgó la autorización (UTC).',
    `revoked_at` DATETIME(3) NULL COMMENT 'Fecha y hora de la revocación por el titular (UTC); nula si la autorización sigue vigente.',

    INDEX `data_consents_person_id_idx`(`person_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Autorización de tratamiento de datos que una persona otorga sobre una versión de la política. guardian_id es obligatorio para menores (regla de aplicación). Se revoca marcando revoked_at. Ámbito: por denominación.';

-- CreateTable
CREATE TABLE `person_attachments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `person_id` INTEGER NOT NULL COMMENT 'Persona a la que pertenece el adjunto (FK a persons.id).',
    `type` VARCHAR(40) NOT NULL COMMENT 'Clase de adjunto en texto libre (hasta 40 caracteres), por ejemplo foto o soporte de documento.',
    `storage_path` VARCHAR(255) NOT NULL COMMENT 'Ruta del archivo en el almacenamiento de archivos.',
    `sha256` CHAR(64) NOT NULL COMMENT 'Huella SHA-256 del contenido del archivo en hexadecimal (64 caracteres), para verificar su integridad.',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',

    INDEX `person_attachments_person_id_idx`(`person_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Archivo adjunto de una persona (foto o soporte), guardado fuera de la base con su huella SHA-256. Se borra al anonimizar la persona. Ámbito: por denominación.';

-- CreateTable
CREATE TABLE `membership_applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede elegida por el solicitante, que revisa la solicitud (FK a congregations.id).',
    `policy_id` INTEGER NOT NULL COMMENT 'Política de tratamiento vigente que aceptó el solicitante (FK a privacy_policies.id).',
    `tracking_code_hash` VARCHAR(128) NOT NULL COMMENT 'Huella SHA-256 en hexadecimal del código de seguimiento entregado al solicitante para consultar el estado; el código no se guarda.',
    `status` ENUM('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'DUPLICATE') NOT NULL DEFAULT 'PENDING' COMMENT 'Estado: PENDING (pendiente), IN_REVIEW (en revisión), APPROVED (aprobada), REJECTED (rechazada) o DUPLICATE (duplicado de una persona existente).',
    `document_type_id` INTEGER NULL COMMENT 'Tipo de documento del solicitante (FK a document_types.id).',
    `document_number` VARCHAR(30) NULL COMMENT 'Número de documento del solicitante, normalizado; sirve para detectar personas ya registradas en la denominación.',
    `first_name` VARCHAR(100) NOT NULL COMMENT 'Nombres del solicitante.',
    `last_name` VARCHAR(160) NOT NULL COMMENT 'Primer apellido del solicitante; el segundo apellido va en form_data.',
    `email` VARCHAR(191) NULL COMMENT 'Correo electrónico de contacto del solicitante; opcional.',
    `phone` VARCHAR(30) NULL COMMENT 'Teléfono de contacto del solicitante (7 a 20 caracteres: dígitos, +, espacios o guiones), obligatorio en el formulario público.',
    `birth_date` DATE NULL COMMENT 'Fecha de nacimiento del solicitante (fecha ISO); determina si es menor de edad y necesita acudiente.',
    `guardian_name` VARCHAR(200) NULL COMMENT 'Nombre completo del acudiente cuando el solicitante es menor de edad; el detalle va en form_data.',
    `guardian_document` VARCHAR(30) NULL COMMENT 'Número de documento normalizado del acudiente de un menor; su tipo va en form_data.',
    `form_data` JSON NOT NULL COMMENT 'Respuestas validadas sin columna propia (JSON): segundo apellido, sexo, estado civil, dirección, municipio, barrio, ocupación, iglesia de procedencia, bautismo y acudiente.',
    `consented_at` DATETIME(3) NOT NULL COMMENT 'Fecha y hora en que el solicitante aceptó la política de tratamiento (UTC); al aprobarse se copia a data_consents.',
    `reviewer_id` INTEGER NULL COMMENT 'Usuario de la secretaría que tomó la solicitud en revisión o la decidió (FK a users.id).',
    `reviewed_at` DATETIME(3) NULL COMMENT 'Fecha y hora de la decisión: aprobación, rechazo o duplicado (UTC); nula mientras está pendiente o en revisión.',
    `rejection_reason` VARCHAR(255) NULL COMMENT 'Motivo del rechazo (10 a 255 caracteres), que leen el siguiente revisor y la auditoría; nulo si no fue rechazada.',
    `matched_person_id` INTEGER NULL COMMENT 'Persona existente con la que coincide, cuando la solicitud se marca como duplicado (FK a persons.id).',
    `member_id` INTEGER NULL COMMENT 'Miembro creado o reactivado al aprobar la solicitud (FK a members.id).',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',
    `updated_at` DATETIME(3) NOT NULL COMMENT 'Fecha y hora de la última modificación (UTC).',

    UNIQUE INDEX `membership_applications_tracking_code_hash_key`(`tracking_code_hash`),
    INDEX `membership_applications_congregation_id_status_created_at_idx`(`congregation_id`, `status`, `created_at`),
    INDEX `membership_applications_denomination_id_document_type_id_doc_idx`(`denomination_id`, `document_type_id`, `document_number`),
    UNIQUE INDEX `membership_applications_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Formulario público de inscripción, sin cuenta de usuario: la persona elige su sede y la secretaría revisa. No crea persona ni miembro hasta aprobarse; form_data guarda el resto del formulario validado. Una persona que se reintegra puede tener varias solicitudes. Ámbito: por sede.';

-- CreateTable
CREATE TABLE `application_attachments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `application_id` INTEGER NOT NULL COMMENT 'Solicitud a la que pertenece el adjunto (FK a membership_applications.id).',
    `type` VARCHAR(40) NOT NULL COMMENT 'Clase de adjunto en texto libre (hasta 40 caracteres), por ejemplo foto o soporte de documento.',
    `storage_path` VARCHAR(255) NOT NULL COMMENT 'Ruta del archivo en el almacenamiento de archivos.',
    `sha256` CHAR(64) NOT NULL COMMENT 'Huella SHA-256 del contenido del archivo en hexadecimal (64 caracteres), para verificar su integridad.',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',

    INDEX `application_attachments_application_id_idx`(`application_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Foto o soporte adjunto al formulario público de inscripción, guardado fuera de la base con su huella SHA-256. Previsto: copiarse a person_attachments al aprobar la solicitud (aún no implementado). Ámbito: por denominación.';

-- CreateTable
CREATE TABLE `ministries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (referencia denominations.id mediante la FK compuesta a congregations).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el ministerio (FK compuesta a congregations.id junto con denomination_id).',
    `name` VARCHAR(120) NOT NULL COMMENT 'Nombre del ministerio, único dentro de la sede (máx. 120 caracteres).',
    `is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Indica si el ministerio está activo; falso lo conserva como histórico sin borrarlo.',

    UNIQUE INDEX `ministries_congregation_id_name_key`(`congregation_id`, `name`),
    UNIQUE INDEX `ministries_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Ministerio de una sede: nivel superior de la jerarquía Ministerio > Grupo > Bloque > Equipo de trabajo. Ámbito por sede. Nombre único dentro de la sede. Estructura provisional (hipótesis) pendiente de validar con el cliente; aún no la usa ningún módulo.';

-- CreateTable
CREATE TABLE `work_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (referencia denominations.id mediante la FK compuesta a ministries).',
    `ministry_id` INTEGER NOT NULL COMMENT 'Ministerio al que pertenece el grupo (FK compuesta a ministries.id junto con denomination_id).',
    `name` VARCHAR(120) NOT NULL COMMENT 'Nombre del grupo de trabajo, único dentro del ministerio (máx. 120 caracteres).',

    UNIQUE INDEX `work_groups_ministry_id_name_key`(`ministry_id`, `name`),
    UNIQUE INDEX `work_groups_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Grupo de trabajo dentro de un ministerio: segundo nivel de la jerarquía Ministerio > Grupo > Bloque > Equipo. Ámbito por denominación, heredando la sede del ministerio. Nombre único dentro del ministerio. Estructura provisional (hipótesis) pendiente de validar con el cliente.';

-- CreateTable
CREATE TABLE `work_blocks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (referencia denominations.id mediante la FK compuesta a work_groups).',
    `work_group_id` INTEGER NOT NULL COMMENT 'Grupo de trabajo al que pertenece el bloque (FK compuesta a work_groups.id junto con denomination_id).',
    `name` VARCHAR(120) NOT NULL COMMENT 'Nombre del bloque de trabajo, único dentro del grupo (máx. 120 caracteres).',

    UNIQUE INDEX `work_blocks_work_group_id_name_key`(`work_group_id`, `name`),
    UNIQUE INDEX `work_blocks_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Bloque de trabajo dentro de un grupo de trabajo: tercer nivel de la jerarquía Ministerio > Grupo > Bloque > Equipo. Ámbito por denominación, heredando la sede del ministerio. Nombre único dentro del grupo. Estructura provisional (hipótesis) pendiente de validar con el cliente.';

-- CreateTable
CREATE TABLE `work_teams` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (referencia denominations.id mediante la FK compuesta a work_blocks).',
    `work_block_id` INTEGER NOT NULL COMMENT 'Bloque de trabajo al que pertenece el equipo (FK compuesta a work_blocks.id junto con denomination_id).',
    `name` VARCHAR(120) NOT NULL COMMENT 'Nombre del equipo de trabajo, único dentro del bloque (máx. 120 caracteres).',

    UNIQUE INDEX `work_teams_work_block_id_name_key`(`work_block_id`, `name`),
    UNIQUE INDEX `work_teams_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Equipo de trabajo dentro de un bloque: último nivel de la jerarquía Ministerio > Grupo > Bloque > Equipo; agrupa miembros y tiene cronogramas. Ámbito por denominación, heredando la sede del ministerio. Nombre único dentro del bloque. Estructura provisional (hipótesis) pendiente de validar con el cliente.';

-- CreateTable
CREATE TABLE `work_team_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (referencia denominations.id mediante las FK compuestas a members y work_teams).',
    `member_id` INTEGER NOT NULL COMMENT 'Miembro que integra el equipo (FK compuesta a members.id junto con denomination_id).',
    `work_team_id` INTEGER NOT NULL COMMENT 'Equipo de trabajo que integra el miembro (FK compuesta a work_teams.id junto con denomination_id).',
    `team_role` VARCHAR(80) NULL COMMENT 'Rol o función del miembro dentro del equipo, en texto libre (máx. 80 caracteres); nulo si no tiene uno definido.',
    `started_on` DATE NOT NULL COMMENT 'Fecha de inicio de la participación en el equipo (fecha calendario AAAA-MM-DD, sin hora).',
    `ended_on` DATE NULL COMMENT 'Fecha de fin de la participación (fecha calendario AAAA-MM-DD); nula mientras el miembro sigue en el equipo.',

    INDEX `work_team_members_member_id_idx`(`member_id`),
    INDEX `work_team_members_work_team_id_idx`(`work_team_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Participación de un miembro en un equipo de trabajo durante un periodo, con su rol opcional. Ámbito por denominación (miembro y equipo de la misma). Un miembro puede repetir equipo en periodos distintos; la participación vigente es la que no tiene fecha de fin. Estructura provisional (hipótesis) pendiente de validar con el cliente.';

-- CreateTable
CREATE TABLE `schedules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (referencia denominations.id mediante la FK compuesta a work_teams).',
    `work_team_id` INTEGER NOT NULL COMMENT 'Equipo de trabajo que planifica el cronograma (FK compuesta a work_teams.id junto con denomination_id).',
    `name` VARCHAR(120) NOT NULL COMMENT 'Nombre descriptivo del cronograma (máx. 120 caracteres).',
    `starts_on` DATE NOT NULL COMMENT 'Fecha de inicio de la vigencia del cronograma (fecha calendario AAAA-MM-DD, sin hora).',
    `ends_on` DATE NULL COMMENT 'Fecha de fin de la vigencia (fecha calendario AAAA-MM-DD); nula si el cronograma no tiene fin definido.',

    INDEX `schedules_work_team_id_idx`(`work_team_id`),
    UNIQUE INDEX `schedules_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Cronograma de un equipo de trabajo: plan con vigencia en fechas en el que se programan temas por día. Ámbito por denominación, heredando la sede del equipo. Estructura provisional (hipótesis) pendiente de validar con el cliente.';

-- CreateTable
CREATE TABLE `topics` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `title` VARCHAR(150) NOT NULL COMMENT 'Título del tema, único dentro de la denominación (máx. 150 caracteres).',
    `description` TEXT NULL COMMENT 'Descripción o contenido del tema en texto libre; nula si no se registró.',

    UNIQUE INDEX `topics_denomination_id_title_key`(`denomination_id`, `title`),
    UNIQUE INDEX `topics_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Tema que puede programarse en los cronogramas (enseñanza o contenido a tratar). Catálogo por denominación, compartido por todas sus sedes. Título único dentro de la denominación. Estructura provisional (hipótesis) pendiente de validar con el cliente.';

-- CreateTable
CREATE TABLE `schedule_topics` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (referencia denominations.id mediante las FK compuestas a schedules, topics y members).',
    `schedule_id` INTEGER NOT NULL COMMENT 'Cronograma en el que se programa el tema (FK compuesta a schedules.id junto con denomination_id).',
    `topic_id` INTEGER NOT NULL COMMENT 'Tema que se programa (FK compuesta a topics.id junto con denomination_id).',
    `scheduled_on` DATE NOT NULL COMMENT 'Fecha en que se tratará el tema (fecha calendario AAAA-MM-DD, sin hora).',
    `responsible_id` INTEGER NULL COMMENT 'Miembro responsable de dictar o dirigir el tema (FK compuesta a members.id junto con denomination_id); nulo si aún no se asignó.',

    INDEX `schedule_topics_schedule_id_scheduled_on_idx`(`schedule_id`, `scheduled_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Programación de un tema en una fecha concreta de un cronograma, con un miembro responsable opcional. Ámbito por denominación (cronograma, tema y responsable de la misma). Estructura provisional (hipótesis) pendiente de validar con el cliente.';

-- CreateTable
CREATE TABLE `countries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `iso_alpha2` CHAR(2) NOT NULL COMMENT 'Código ISO 3166-1 alfa-2 del país en mayúsculas (CO); único y usado para nombrar su archivo de divisiones.',
    `iso_alpha3` CHAR(3) NULL COMMENT 'Código ISO 3166-1 alfa-3 del país (COL); único, nulo si no tiene uno oficial, como Kosovo.',
    `name` VARCHAR(100) NOT NULL COMMENT 'Nombre del país en español; único en el catálogo.',
    `phone_code` VARCHAR(4) NULL COMMENT 'Indicativo telefónico internacional sin el signo + (57); nulo si no se conoce.',
    `is_active` BOOLEAN NOT NULL DEFAULT false COMMENT 'Indica si el país está activo en el sistema; lo cambia la plataforma, no se desactiva con razones sociales activas y el seed solo lo fija al crearlo.',

    UNIQUE INDEX `countries_iso_alpha2_key`(`iso_alpha2`),
    UNIQUE INDEX `countries_iso_alpha3_key`(`iso_alpha3`),
    UNIQUE INDEX `countries_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='País. Catálogo global de geografía, compartido por todas las denominaciones y cargado desde prisma/seed-data/countries.json. Lo administra la plataforma: solo los países activos se ofrecen para razones sociales y búsquedas de municipios.';

-- CreateTable
CREATE TABLE `regions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `country_id` INTEGER NOT NULL COMMENT 'País al que pertenece la subdivisión (FK a countries.id).',
    `code` VARCHAR(10) NULL COMMENT 'Código oficial de la subdivisión, único en el país; en Colombia, el código DANE del departamento (05). Nulo si no tiene uno.',
    `name` VARCHAR(100) NOT NULL COMMENT 'Nombre oficial de la subdivisión, único dentro del país.',

    UNIQUE INDEX `regions_country_id_code_key`(`country_id`, `code`),
    UNIQUE INDEX `regions_country_id_name_key`(`country_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Departamento, estado o provincia de un país. Catálogo global de geografía, cargado desde prisma/seed-data/divisions/<ISO alfa-2>.json. El código y el nombre son únicos dentro del país.';

-- CreateTable
CREATE TABLE `municipalities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `region_id` INTEGER NOT NULL COMMENT 'Departamento o estado al que pertenece el municipio (FK a regions.id).',
    `code` VARCHAR(10) NULL COMMENT 'Código oficial, único en el departamento; en Colombia, el código DIVIPOLA del DANE (05001). Nulo si no tiene uno.',
    `name` VARCHAR(100) NOT NULL COMMENT 'Nombre oficial del municipio, único dentro del departamento.',

    UNIQUE INDEX `municipalities_region_id_code_key`(`region_id`, `code`),
    UNIQUE INDEX `municipalities_region_id_name_key`(`region_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Municipio o ciudad. Catálogo global de geografía; cada país con municipios tiene su archivo en prisma/seed-data/divisions/<ISO alfa-2>.json. El código es único dentro del departamento, no en el mundo: se resuelve siempre junto con el país.';

-- CreateTable
CREATE TABLE `neighborhoods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `municipality_id` INTEGER NOT NULL COMMENT 'Municipio al que pertenece el barrio (FK a municipalities.id).',
    `name` VARCHAR(120) NOT NULL COMMENT 'Nombre del barrio tal como se escribió por primera vez; único por municipio sin distinguir mayúsculas ni tildes (intercalación).',

    UNIQUE INDEX `neighborhoods_municipality_id_name_key`(`municipality_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Barrio de un municipio. Catálogo global compartido por todas las denominaciones: se crea al vuelo con el texto escrito en sedes, inscripciones y direcciones de personas, y se reutiliza si ya existe en el municipio sin distinguir mayúsculas ni tildes.';

-- CreateTable
CREATE TABLE `denominations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `name` VARCHAR(200) NOT NULL COMMENT 'Nombre de la denominación; único en la plataforma.',
    `logo_path` VARCHAR(255) NULL COMMENT 'Ruta del archivo del logo de la denominación; nulo si no tiene logo. Reservado: el código actual aún no la usa.',
    `is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Indica si la denominación está activa; si es falso, sus roles no dan acceso y sus sedes salen del formulario público.',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',
    `updated_at` DATETIME(3) NOT NULL COMMENT 'Fecha y hora de la última modificación (UTC).',
    `deleted_at` DATETIME(3) NULL COMMENT 'Fecha y hora del borrado lógico (UTC); nulo si el registro está vigente.',

    UNIQUE INDEX `denominations_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Denominación o iglesia cliente: unidad de aislamiento (tenant) de todos los datos de negocio. La crea un administrador de plataforma, que la provisiona con un fondo inicial, plan de cuentas, tipos de aporte y de certificado, rangos, cargos y un borrador de política de datos. Inactiva, sus roles no dan acceso.';

-- CreateTable
CREATE TABLE `legal_entities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `country_id` INTEGER NOT NULL COMMENT 'País de la razón social; no puede cambiar mientras tenga sedes (FK a countries.id).',
    `legal_name` VARCHAR(200) NOT NULL COMMENT 'Razón social o nombre legal registrado de la entidad.',
    `trade_name` VARCHAR(200) NULL COMMENT 'Nombre comercial o de uso común; nulo si no tiene uno distinto.',
    `tax_id` VARCHAR(30) NOT NULL COMMENT 'NIT con dígito de verificación en forma canónica (900.123.456-7); único en toda la plataforma, incluso para filas borradas.',
    `legal_representative` VARCHAR(200) NULL COMMENT 'Nombre completo del representante legal; los casos de uso lo exigen aunque la columna admita nulo.',
    `email` VARCHAR(191) NULL COMMENT 'Correo electrónico de contacto de la razón social, guardado en minúsculas; nulo si no se registró.',
    `phone` VARCHAR(30) NULL COMMENT 'Teléfono de contacto de la razón social, en texto libre; nulo si no se registró.',
    `address` VARCHAR(200) NULL COMMENT 'Dirección postal de la razón social; nulo si no se registró.',
    `municipality_id` INTEGER NULL COMMENT 'Municipio del domicilio, del mismo país de la razón social; nulo si no se indicó (FK a municipalities.id).',
    `is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Indica si la razón social está activa; una inactiva no se ofrece para nuevas sedes y solo se desactiva sin sedes activas.',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',
    `updated_at` DATETIME(3) NOT NULL COMMENT 'Fecha y hora de la última modificación (UTC).',
    `deleted_at` DATETIME(3) NULL COMMENT 'Fecha y hora del borrado lógico (UTC); nulo si el registro está vigente.',

    UNIQUE INDEX `legal_entities_tax_id_key`(`tax_id`),
    INDEX `legal_entities_country_id_idx`(`country_id`),
    UNIQUE INDEX `legal_entities_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Razón social (persona jurídica) de una denominación; una denominación puede tener una o varias y cada sede elige la suya. Por denominación. Pertenece a un país: su municipio (opcional) y el de cada una de sus sedes deben ser de ese país. La regla cruza tablas, así que la validan los casos de uso.';

-- CreateTable
CREATE TABLE `districts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `number` VARCHAR(20) NOT NULL COMMENT 'Número o código del distrito, guardado como texto; único dentro de la denominación.',
    `name` VARCHAR(150) NULL COMMENT 'Nombre descriptivo del distrito; nulo si solo se identifica por su número.',

    UNIQUE INDEX `districts_denomination_id_number_key`(`denomination_id`, `number`),
    UNIQUE INDEX `districts_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Distrito: agrupación administrativa de sedes dentro de una denominación. Por denominación; una sede pertenece a lo sumo a un distrito. El número es único en la denominación y no tiene borrado lógico ni estado activo.';

-- CreateTable
CREATE TABLE `congregations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `legal_entity_id` INTEGER NOT NULL COMMENT 'Razón social de la sede, de la misma denominación por FK compuesta con denomination_id (FK a legal_entities.id).',
    `district_id` INTEGER NULL COMMENT 'Distrito de la sede, de la misma denominación por FK compuesta con denomination_id; nulo si no está en ningún distrito (FK a districts.id).',
    `municipality_id` INTEGER NOT NULL COMMENT 'Municipio de la sede, obligatorio y del país de la razón social según los casos de uso (FK a municipalities.id).',
    `neighborhood_id` INTEGER NULL COMMENT 'Barrio de la sede dentro de su municipio; nulo si no se indicó (FK a neighborhoods.id).',
    `code` VARCHAR(10) NOT NULL COMMENT 'Abreviatura estable de 2 a 10 letras o números en mayúsculas (MSC); prefijo del código de miembro y de carné, no cambia al renombrar.',
    `name` VARCHAR(150) NOT NULL COMMENT 'Nombre de la sede; único en la denominación sin distinguir mayúsculas ni tildes.',
    `address` VARCHAR(200) NULL COMMENT 'Dirección postal de la sede; la gestión de sedes del administrador la exige, pero el registro público de sede la deja opcional, así que puede ser nula.',
    `phone` VARCHAR(30) NULL COMMENT 'Teléfono de contacto de la sede, en texto libre; nulo si no se registró.',
    `email` VARCHAR(191) NULL COMMENT 'Correo electrónico de contacto de la sede, guardado en minúsculas; nulo si no se registró.',
    `accepts_applications` BOOLEAN NOT NULL DEFAULT true COMMENT 'Indica si la sede recibe inscripciones; si es falso no aparece en el formulario público. Una sede inactiva nunca las recibe.',
    `is_active` BOOLEAN NOT NULL DEFAULT true COMMENT 'Indica si la sede está activa; al desactivarla se cierran sus inscripciones y los roles ligados a ella dejan de dar acceso.',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',
    `updated_at` DATETIME(3) NOT NULL COMMENT 'Fecha y hora de la última modificación (UTC).',
    `deleted_at` DATETIME(3) NULL COMMENT 'Fecha y hora del borrado lógico (UTC); nulo si el registro está vigente.',

    INDEX `congregations_denomination_id_accepts_applications_is_active_idx`(`denomination_id`, `accepts_applications`, `is_active`),
    UNIQUE INDEX `congregations_denomination_id_name_key`(`denomination_id`, `name`),
    UNIQUE INDEX `congregations_denomination_id_code_key`(`denomination_id`, `code`),
    UNIQUE INDEX `congregations_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Sede o congregación local de una denominación, donde se registran miembros, aportes y secretaría. Por denominación. Al crearse elige su razón social (y opcionalmente su distrito) de la misma denominación; nombre y código son únicos en ella.';

-- CreateTable
CREATE TABLE `pastoral_terms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el registro: la sede que el pastor dirige durante el periodo (FK a congregations.id).',
    `pastor_id` INTEGER NOT NULL COMMENT 'Persona que ejerce como pastor de la sede durante el periodo (FK a persons.id).',
    `started_on` DATE NOT NULL COMMENT 'Fecha de inicio del periodo pastoral (fecha ISO, sin hora).',
    `ended_on` DATE NULL COMMENT 'Último día del periodo (fecha ISO, inclusiva); nulo si el periodo está abierto, sin cierre definido. No puede ser anterior a started_on; al registrar puede ser futura.',

    INDEX `pastoral_terms_congregation_id_started_on_idx`(`congregation_id`, `started_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Periodo de un pastor al frente de una sede, con fecha de inicio y de fin. Ámbito: por sede, dentro de la denominación. Los periodos de una misma sede nunca se solapan (la API lo valida con bloqueo de la sede); el pastor vigente es el del periodo que cubre la fecha actual y solo puede haber un periodo abierto (sin fecha de fin).';

-- CreateTable
CREATE TABLE `marriages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `spouse1_id` INTEGER NOT NULL COMMENT 'Cónyuge con el id menor de la pareja; el CHECK exige spouse1_id menor que spouse2_id para no duplicar la pareja (FK a persons.id).',
    `spouse2_id` INTEGER NOT NULL COMMENT 'Cónyuge con el id mayor de la pareja (FK a persons.id).',
    `is_civil` BOOLEAN NOT NULL DEFAULT false COMMENT 'Indica si hubo rito civil; puede coexistir con los demás ritos. La API lo marca cuando registered_with es NOTARY.',
    `is_christian` BOOLEAN NOT NULL DEFAULT false COMMENT 'Indica si hubo rito cristiano; puede coexistir con los demás ritos. La API lo marca cuando registered_with es CHURCH.',
    `is_catholic` BOOLEAN NOT NULL DEFAULT false COMMENT 'Indica si hubo rito católico, dato de los formularios de la iglesia; la API actual siempre lo registra en falso.',
    `registered_with` ENUM('NOTARY', 'CHURCH') NULL COMMENT 'Dónde quedó registrado: NOTARY = notaría (civil), CHURCH = iglesia (cristiano). Si es nulo se deduce de is_civil o is_christian.',
    `married_on` DATE NULL COMMENT 'Fecha de celebración (fecha ISO); no puede ser futura y ambos cónyuges deben ser mayores de edad ese día. Nula si se desconoce.',
    `ended_on` DATE NULL COMMENT 'Fecha de disolución (fecha ISO); nula si el matrimonio está vigente. No puede ser futura ni anterior a married_on.',
    `end_reason` ENUM('DIVORCE', 'DEATH', 'ANNULMENT') NULL COMMENT 'Motivo de la disolución: DIVORCE = divorcio, DEATH = fallecimiento de un cónyuge, ANNULMENT = anulación. Nulo si está vigente.',
    `tribunal_opinion` VARCHAR(255) NULL COMMENT 'Concepto del tribunal eclesiástico sobre el matrimonio. Dato de acceso restringido: la API nunca lo selecciona ni lo expone.',
    `place` VARCHAR(150) NULL COMMENT 'Lugar donde se celebró la ceremonia (texto libre, máximo 150 caracteres).',
    `officiant_id` INTEGER NULL COMMENT 'Persona que ofició la ceremonia; no puede ser uno de los cónyuges (CHECK). Nulo si no se registró (FK a persons.id).',

    INDEX `marriages_spouse1_id_idx`(`spouse1_id`),
    INDEX `marriages_spouse2_id_idx`(`spouse2_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Matrimonio entre dos personas de la denominación; única fuente de verdad del cónyuge. Ámbito: por denominación, sin sede (una sede ve los de sus miembros). spouse1_id es siempre el menor de los dos (CHECK); nadie tiene dos matrimonios vigentes y la disolución guarda fecha y motivo sin borrar el registro.';

-- CreateTable
CREATE TABLE `child_dedications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el registro: donde se hizo la presentación, que debe ser la sede del niño si es miembro (FK a congregations.id).',
    `child_id` INTEGER NOT NULL COMMENT 'Niño o niña presentado; la API impide registrar una segunda presentación de la misma persona (FK a persons.id).',
    `pastor_id` INTEGER NULL COMMENT 'Pastor que hizo la presentación; nulo si no se registró (FK a persons.id).',
    `dedicated_on` DATE NOT NULL COMMENT 'Fecha de la presentación (fecha ISO); no puede ser futura ni anterior al nacimiento.',

    INDEX `child_dedications_congregation_id_dedicated_on_idx`(`congregation_id`, `dedicated_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Presentación de un niño o niña ante la iglesia. Ámbito: por sede. Contiene datos de menores: cada consulta individual queda auditada. Un niño tiene una sola presentación; el padre, la madre o el acudiente no se guardan aquí, se vinculan en family_relations.';

-- CreateTable
CREATE TABLE `meeting_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `code` VARCHAR(30) NOT NULL COMMENT 'Código estable y único del tipo de reunión (por ejemplo SUNDAY_SCHOOL); la API identifica el tipo por este código.',
    `name` VARCHAR(80) NOT NULL COMMENT 'Nombre visible del tipo de reunión en español.',

    UNIQUE INDEX `meeting_types_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Catálogo de tipos de reunión en los que se toma asistencia (Escuela Dominical, culto dominical, reunión de oración, etc.). Ámbito: global, compartido por todas las denominaciones; lo carga el seed.';

-- CreateTable
CREATE TABLE `attendance_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `code` VARCHAR(30) NOT NULL COMMENT 'Código estable y único de la categoría (por ejemplo CHILDREN); la API identifica la categoría por este código.',
    `name` VARCHAR(80) NOT NULL COMMENT 'Nombre visible de la categoría en español.',

    UNIQUE INDEX `attendance_categories_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Catálogo de categorías en que se cuentan los asistentes de una reunión (niños, adolescentes, hermanas, hermanos, visitas). Ámbito: global, compartido por todas las denominaciones; lo carga el seed.';

-- CreateTable
CREATE TABLE `attendance_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el registro: donde se realizó la reunión (FK a congregations.id).',
    `meeting_type_id` INTEGER NOT NULL COMMENT 'Tipo de reunión a la que corresponde la sesión (FK a meeting_types.id).',
    `session_date` DATE NOT NULL COMMENT 'Fecha en que se realizó la reunión (fecha ISO); no puede ser futura según la hora de Bogotá.',
    `recorded_by_id` INTEGER NULL COMMENT 'Usuario que registró la sesión o hizo la última corrección de sus conteos; nulo si no se conoce (FK a users.id).',
    `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora del registro o de la última corrección de los conteos (UTC).',

    UNIQUE INDEX `attendance_sessions_congregation_id_meeting_type_id_session__key`(`congregation_id`, `meeting_type_id`, `session_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Registro de asistencia de una reunión: una sola sesión por sede, tipo de reunión y fecha. Ámbito: por sede. El total no se guarda: es la suma de sus conteos por categoría en attendance_counts.';

-- CreateTable
CREATE TABLE `attendance_counts` (
    `session_id` INTEGER NOT NULL COMMENT 'Sesión de asistencia a la que pertenece el conteo (FK a attendance_sessions.id).',
    `category_id` INTEGER NOT NULL COMMENT 'Categoría de asistentes contada (FK a attendance_categories.id).',
    `headcount` INTEGER NOT NULL COMMENT 'Número de asistentes de la categoría: entero de 0 a 2000 (el CHECK exige no negativo; el tope lo valida la API).',

    PRIMARY KEY (`session_id`, `category_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Cantidad de asistentes de una categoría en una sesión de asistencia; clave primaria sesión más categoría. Ámbito: por sede, heredado de la sesión. Se guarda una fila por cada categoría del catálogo (0 si nadie asistió); corregir la sesión reemplaza todas sus filas.';

-- CreateTable
CREATE TABLE `certificate_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `code` VARCHAR(30) NOT NULL COMMENT 'Código corto del tipo, único por denominación (A-Z, 0-9 y guion bajo); forma la clave del consecutivo y el número impreso, como en CERT-MEM-2026-0031.',
    `name` VARCHAR(100) NOT NULL COMMENT 'Nombre visible del tipo de certificado, por ejemplo Certificado de membresía.',
    `template` TEXT NULL COMMENT 'Cuerpo personalizado con marcadores {{memberName}}, {{document}}, {{memberCode}}, {{congregation}}, {{sede}}, {{joinedOn}}, {{baptismDate}}; nulo usa el texto por defecto.',
    `validity_days` INTEGER NULL COMMENT 'Días de vigencia del certificado contados desde su expedición; nulo si el certificado no vence.',

    UNIQUE INDEX `certificate_types_denomination_id_code_key`(`denomination_id`, `code`),
    UNIQUE INDEX `certificate_types_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Tipo de certificado que una denominación puede expedir. Ámbito: por denominación. Al crear la denominación se cargan MEM (membresía), TRA (traslado), BAU (bautismo) y ASI (asistencia); cada tipo lleva su propio consecutivo por sede.';

-- CreateTable
CREATE TABLE `document_sequences` (
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el registro: la sede dueña del contador (FK a congregations.id).',
    `key` VARCHAR(60) NOT NULL COMMENT 'Clave del contador (máximo 60): MEMBER = número de miembro, VOUCHER:«tipo» = comprobantes, CERT:«código» = certificados por tipo.',
    `last_value` INTEGER NOT NULL DEFAULT 0 COMMENT 'Último número asignado con esta clave; el siguiente documento recibe este valor más uno. Empieza en 0.',

    PRIMARY KEY (`congregation_id`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Contador de numeración consecutiva por sede y clave: números de miembro, comprobantes y certificados. Ámbito: por sede. Se incrementa dentro de la transacción que guarda el documento, así que no deja huecos ni colisiones; nunca se reinicia (el año solo es formato).';

-- CreateTable
CREATE TABLE `certificates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el registro: la sede que expide el certificado (FK a congregations.id).',
    `certificate_type_id` INTEGER NOT NULL COMMENT 'Tipo de certificado expedido (FK a certificate_types.id).',
    `member_id` INTEGER NOT NULL COMMENT 'Miembro al que se le expide el certificado (FK a members.id).',
    `sequence_number` INTEGER NOT NULL COMMENT 'Consecutivo sin huecos por sede y tipo, tomado de document_sequences; se imprime como CERT-«código»-«año»-0000.',
    `issued_on` DATE NOT NULL COMMENT 'Fecha de expedición (fecha ISO): el día de la emisión según la hora de Bogotá; su año aparece en el número impreso.',
    `expires_on` DATE NULL COMMENT 'Fecha de vencimiento (fecha ISO): issued_on más validity_days del tipo; nula si el tipo no vence.',
    `valid_for` VARCHAR(150) NULL COMMENT 'Texto de destino o trámite para el que se expide el certificado («válido para»); la API actual no lo diligencia y queda nulo.',
    `notes` VARCHAR(255) NULL COMMENT 'Observaciones opcionales que se imprimen en el certificado (máximo 255 caracteres).',
    `pastor_signer_id` INTEGER NOT NULL COMMENT 'Pastor que firma el certificado; es obligatorio para expedirlo (FK a persons.id).',
    `secretary_signer_id` INTEGER NULL COMMENT 'Firmante por la secretaría (rol SECRETARY de la sede, de preferencia quien expide); nulo si no hay firma o el firmante no tiene persona vinculada (nombre solo en snapshot) (FK a persons.id).',
    `issued_by_id` INTEGER NULL COMMENT 'Usuario del sistema que expidió el certificado; nulo si no hay usuario asociado (FK a users.id).',
    `snapshot` JSON NOT NULL COMMENT 'Copia JSON de lo impreso: número, título, membrete, textos, firmantes y datos del miembro; no se modifica después de expedido.',
    `voided_at` DATETIME(3) NULL COMMENT 'Fecha y hora de anulación (UTC); nula si el certificado está vigente.',
    `void_reason` VARCHAR(255) NULL COMMENT 'Motivo de la anulación (10 a 255 caracteres, obligatorio al anular en la API); solo puede tener valor si voided_at lo tiene (CHECK).',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Fecha y hora de creación del registro (UTC).',

    INDEX `certificates_member_id_idx`(`member_id`),
    INDEX `certificates_congregation_id_issued_on_idx`(`congregation_id`, `issued_on`),
    UNIQUE INDEX `certificates_congregation_id_certificate_type_id_sequence_nu_key`(`congregation_id`, `certificate_type_id`, `sequence_number`),
    UNIQUE INDEX `certificates_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Certificado expedido a un miembro, con número consecutivo por sede y tipo. Ámbito: por sede; se expide en la sede actual del miembro (lo valida la API). snapshot conserva lo impreso, así que el documento no cambia si cambian los datos; los certificados se anulan, nunca se borran.';

-- CreateTable
CREATE TABLE `membership_cards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno autoincremental.',
    `denomination_id` INTEGER NOT NULL COMMENT 'Denominación dueña del registro; aísla los datos entre iglesias (FK a denominations.id).',
    `member_id` INTEGER NOT NULL COMMENT 'Miembro titular del carné (FK a members.id).',
    `congregation_id` INTEGER NOT NULL COMMENT 'Sede a la que pertenece el registro: la que emitió el carné; se conserva aunque el miembro se traslade (FK a congregations.id).',
    `member_number` INTEGER NOT NULL COMMENT 'Número del miembro en el registro de la sede emisora (consecutivo MEMBER); se imprime como «código de sede»-0000, por ejemplo SC-0153, y se conserva tras un traslado.',
    `issued_on` DATE NOT NULL COMMENT 'Fecha de emisión del carné (fecha ISO); no puede ser futura.',
    `expires_on` DATE NOT NULL COMMENT 'Fecha de vencimiento (fecha ISO), posterior a issued_on; el carné es válido si no está anulado y esta fecha no ha pasado.',
    `voided_at` DATETIME(3) NULL COMMENT 'Fecha y hora de anulación (UTC); nula si el carné no se ha anulado.',
    `void_reason` VARCHAR(255) NULL COMMENT 'Motivo de la anulación (máximo 255); existe si y solo si voided_at tiene valor (CHECK). Si lo reemplaza un carné nuevo, el motivo es automático.',

    INDEX `membership_cards_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Carné de membresía emitido por una sede, con fechas de emisión y vencimiento. Ámbito: por sede. Un miembro tiene a lo sumo un carné válido por sede; al emitir uno nuevo se anulan los válidos de sedes anteriores. Los carnés se anulan, nunca se borran.';

-- AddForeignKey
ALTER TABLE `funds` ADD CONSTRAINT `funds_denomination_id_fkey` FOREIGN KEY (`denomination_id`) REFERENCES `denominations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_denomination_id_fkey` FOREIGN KEY (`denomination_id`) REFERENCES `denominations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_denomination_id_default_fund_id_fkey` FOREIGN KEY (`denomination_id`, `default_fund_id`) REFERENCES `funds`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_denomination_id_parent_id_fkey` FOREIGN KEY (`denomination_id`, `parent_id`) REFERENCES `accounts`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `contribution_types` ADD CONSTRAINT `contribution_types_denomination_id_fkey` FOREIGN KEY (`denomination_id`) REFERENCES `denominations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `contribution_types` ADD CONSTRAINT `contribution_types_denomination_id_account_id_fkey` FOREIGN KEY (`denomination_id`, `account_id`) REFERENCES `accounts`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `fund_opening_balances` ADD CONSTRAINT `fund_opening_balances_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `fund_opening_balances` ADD CONSTRAINT `fund_opening_balances_denomination_id_fund_id_fkey` FOREIGN KEY (`denomination_id`, `fund_id`) REFERENCES `funds`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `accounting_periods` ADD CONSTRAINT `accounting_periods_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_denomination_id_signer_id_fkey` FOREIGN KEY (`denomination_id`, `signer_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `cash_transactions` ADD CONSTRAINT `cash_transactions_denomination_id_congregation_id_period_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`, `period_id`) REFERENCES `accounting_periods`(`denomination_id`, `congregation_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `cash_transactions` ADD CONSTRAINT `cash_transactions_denomination_id_account_id_fkey` FOREIGN KEY (`denomination_id`, `account_id`) REFERENCES `accounts`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `cash_transactions` ADD CONSTRAINT `cash_transactions_denomination_id_fund_id_fkey` FOREIGN KEY (`denomination_id`, `fund_id`) REFERENCES `funds`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `cash_transactions` ADD CONSTRAINT `cash_transactions_denomination_id_congregation_id_voucher_i_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`, `voucher_id`) REFERENCES `vouchers`(`denomination_id`, `congregation_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `cash_transactions` ADD CONSTRAINT `cash_transactions_denomination_id_congregation_id_reversal__fkey` FOREIGN KEY (`denomination_id`, `congregation_id`, `reversal_of_id`) REFERENCES `cash_transactions`(`denomination_id`, `congregation_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `cash_transactions` ADD CONSTRAINT `cash_transactions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `vow_pledges` ADD CONSTRAINT `vow_pledges_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `vow_pledges` ADD CONSTRAINT `vow_pledges_denomination_id_person_id_fkey` FOREIGN KEY (`denomination_id`, `person_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `vow_pledges` ADD CONSTRAINT `vow_pledges_denomination_id_contribution_type_id_fkey` FOREIGN KEY (`denomination_id`, `contribution_type_id`) REFERENCES `contribution_types`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_denomination_id_contribution_type_id_fkey` FOREIGN KEY (`denomination_id`, `contribution_type_id`) REFERENCES `contribution_types`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_denomination_id_person_id_fkey` FOREIGN KEY (`denomination_id`, `person_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_denomination_id_person_id_contribution_type_i_fkey` FOREIGN KEY (`denomination_id`, `person_id`, `contribution_type_id`, `vow_pledge_id`) REFERENCES `vow_pledges`(`denomination_id`, `person_id`, `contribution_type_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_denomination_id_congregation_id_cash_transact_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`, `cash_transaction_id`) REFERENCES `cash_transactions`(`denomination_id`, `congregation_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_denomination_id_congregation_id_voucher_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`, `voucher_id`) REFERENCES `vouchers`(`denomination_id`, `congregation_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_denomination_id_congregation_id_tithe_settlem_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`, `tithe_settlement_id`) REFERENCES `tithe_settlements`(`denomination_id`, `congregation_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_recorded_by_id_fkey` FOREIGN KEY (`recorded_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_voided_by_id_fkey` FOREIGN KEY (`voided_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `tithe_settlement_rules` ADD CONSTRAINT `tithe_settlement_rules_denomination_id_fkey` FOREIGN KEY (`denomination_id`) REFERENCES `denominations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `tithe_settlements` ADD CONSTRAINT `tithe_settlements_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `tithe_settlements` ADD CONSTRAINT `tithe_settlements_denomination_id_congregation_id_voucher_i_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`, `voucher_id`) REFERENCES `vouchers`(`denomination_id`, `congregation_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `tithe_settlements` ADD CONSTRAINT `tithe_settlements_denomination_id_pastor_id_fkey` FOREIGN KEY (`denomination_id`, `pastor_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `tithe_settlements` ADD CONSTRAINT `tithe_settlements_voided_by_id_fkey` FOREIGN KEY (`voided_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `budgets` ADD CONSTRAINT `budgets_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `budget_lines` ADD CONSTRAINT `budget_lines_denomination_id_budget_id_fkey` FOREIGN KEY (`denomination_id`, `budget_id`) REFERENCES `budgets`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `budget_lines` ADD CONSTRAINT `budget_lines_denomination_id_account_id_fkey` FOREIGN KEY (`denomination_id`, `account_id`) REFERENCES `accounts`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `budget_lines` ADD CONSTRAINT `budget_lines_denomination_id_fund_id_fkey` FOREIGN KEY (`denomination_id`, `fund_id`) REFERENCES `funds`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_denomination_id_fkey` FOREIGN KEY (`denomination_id`) REFERENCES `denominations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_granted_by_id_fkey` FOREIGN KEY (`granted_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_tokens` ADD CONSTRAINT `user_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `pastoral_ranks` ADD CONSTRAINT `pastoral_ranks_denomination_id_fkey` FOREIGN KEY (`denomination_id`) REFERENCES `denominations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `studies` ADD CONSTRAINT `studies_denomination_id_fkey` FOREIGN KEY (`denomination_id`) REFERENCES `denominations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `studies` ADD CONSTRAINT `studies_study_type_id_fkey` FOREIGN KEY (`study_type_id`) REFERENCES `study_types`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `church_positions` ADD CONSTRAINT `church_positions_denomination_id_fkey` FOREIGN KEY (`denomination_id`) REFERENCES `denominations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `persons` ADD CONSTRAINT `persons_denomination_id_fkey` FOREIGN KEY (`denomination_id`) REFERENCES `denominations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `persons` ADD CONSTRAINT `persons_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `persons` ADD CONSTRAINT `persons_document_type_id_fkey` FOREIGN KEY (`document_type_id`) REFERENCES `document_types`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `persons` ADD CONSTRAINT `persons_document_issue_place_id_fkey` FOREIGN KEY (`document_issue_place_id`) REFERENCES `municipalities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `persons` ADD CONSTRAINT `persons_birth_place_id_fkey` FOREIGN KEY (`birth_place_id`) REFERENCES `municipalities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `persons` ADD CONSTRAINT `persons_marital_status_id_fkey` FOREIGN KEY (`marital_status_id`) REFERENCES `marital_statuses`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `persons` ADD CONSTRAINT `persons_education_level_id_fkey` FOREIGN KEY (`education_level_id`) REFERENCES `education_levels`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `person_addresses` ADD CONSTRAINT `person_addresses_denomination_id_person_id_fkey` FOREIGN KEY (`denomination_id`, `person_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `person_addresses` ADD CONSTRAINT `person_addresses_municipality_id_fkey` FOREIGN KEY (`municipality_id`) REFERENCES `municipalities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `person_addresses` ADD CONSTRAINT `person_addresses_neighborhood_id_fkey` FOREIGN KEY (`neighborhood_id`) REFERENCES `neighborhoods`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `person_contacts` ADD CONSTRAINT `person_contacts_denomination_id_person_id_fkey` FOREIGN KEY (`denomination_id`, `person_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `socioeconomic_profiles` ADD CONSTRAINT `socioeconomic_profiles_denomination_id_person_id_fkey` FOREIGN KEY (`denomination_id`, `person_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `family_relations` ADD CONSTRAINT `family_relations_denomination_id_person_id_fkey` FOREIGN KEY (`denomination_id`, `person_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `family_relations` ADD CONSTRAINT `family_relations_denomination_id_relative_id_fkey` FOREIGN KEY (`denomination_id`, `relative_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `person_studies` ADD CONSTRAINT `person_studies_denomination_id_person_id_fkey` FOREIGN KEY (`denomination_id`, `person_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `person_studies` ADD CONSTRAINT `person_studies_denomination_id_study_id_fkey` FOREIGN KEY (`denomination_id`, `study_id`) REFERENCES `studies`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `members` ADD CONSTRAINT `members_denomination_id_person_id_fkey` FOREIGN KEY (`denomination_id`, `person_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `members` ADD CONSTRAINT `members_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `members` ADD CONSTRAINT `members_denomination_id_baptizing_pastor_id_fkey` FOREIGN KEY (`denomination_id`, `baptizing_pastor_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `members` ADD CONSTRAINT `members_denomination_id_pastoral_rank_id_fkey` FOREIGN KEY (`denomination_id`, `pastoral_rank_id`) REFERENCES `pastoral_ranks`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `member_registry_entries` ADD CONSTRAINT `member_registry_entries_denomination_id_member_id_fkey` FOREIGN KEY (`denomination_id`, `member_id`) REFERENCES `members`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `member_registry_entries` ADD CONSTRAINT `member_registry_entries_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `member_status_history` ADD CONSTRAINT `member_status_history_denomination_id_member_id_fkey` FOREIGN KEY (`denomination_id`, `member_id`) REFERENCES `members`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `member_status_history` ADD CONSTRAINT `member_status_history_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `member_transfers` ADD CONSTRAINT `member_transfers_denomination_id_member_id_fkey` FOREIGN KEY (`denomination_id`, `member_id`) REFERENCES `members`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `member_transfers` ADD CONSTRAINT `member_transfers_denomination_id_origin_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `origin_congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `member_transfers` ADD CONSTRAINT `member_transfers_denomination_id_destination_congregation_i_fkey` FOREIGN KEY (`denomination_id`, `destination_congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `member_transfers` ADD CONSTRAINT `member_transfers_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `member_transfers` ADD CONSTRAINT `member_transfers_denomination_id_certificate_id_fkey` FOREIGN KEY (`denomination_id`, `certificate_id`) REFERENCES `certificates`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `member_positions` ADD CONSTRAINT `member_positions_denomination_id_member_id_fkey` FOREIGN KEY (`denomination_id`, `member_id`) REFERENCES `members`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `member_positions` ADD CONSTRAINT `member_positions_denomination_id_position_id_fkey` FOREIGN KEY (`denomination_id`, `position_id`) REFERENCES `church_positions`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `privacy_policies` ADD CONSTRAINT `privacy_policies_denomination_id_fkey` FOREIGN KEY (`denomination_id`) REFERENCES `denominations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `data_consents` ADD CONSTRAINT `data_consents_denomination_id_person_id_fkey` FOREIGN KEY (`denomination_id`, `person_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `data_consents` ADD CONSTRAINT `data_consents_denomination_id_guardian_id_fkey` FOREIGN KEY (`denomination_id`, `guardian_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `data_consents` ADD CONSTRAINT `data_consents_denomination_id_policy_id_fkey` FOREIGN KEY (`denomination_id`, `policy_id`) REFERENCES `privacy_policies`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `person_attachments` ADD CONSTRAINT `person_attachments_denomination_id_person_id_fkey` FOREIGN KEY (`denomination_id`, `person_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `membership_applications` ADD CONSTRAINT `membership_applications_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `membership_applications` ADD CONSTRAINT `membership_applications_denomination_id_policy_id_fkey` FOREIGN KEY (`denomination_id`, `policy_id`) REFERENCES `privacy_policies`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `membership_applications` ADD CONSTRAINT `membership_applications_document_type_id_fkey` FOREIGN KEY (`document_type_id`) REFERENCES `document_types`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `membership_applications` ADD CONSTRAINT `membership_applications_reviewer_id_fkey` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `membership_applications` ADD CONSTRAINT `membership_applications_denomination_id_matched_person_id_fkey` FOREIGN KEY (`denomination_id`, `matched_person_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `membership_applications` ADD CONSTRAINT `membership_applications_denomination_id_member_id_fkey` FOREIGN KEY (`denomination_id`, `member_id`) REFERENCES `members`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `application_attachments` ADD CONSTRAINT `application_attachments_denomination_id_application_id_fkey` FOREIGN KEY (`denomination_id`, `application_id`) REFERENCES `membership_applications`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ministries` ADD CONSTRAINT `ministries_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `work_groups` ADD CONSTRAINT `work_groups_denomination_id_ministry_id_fkey` FOREIGN KEY (`denomination_id`, `ministry_id`) REFERENCES `ministries`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `work_blocks` ADD CONSTRAINT `work_blocks_denomination_id_work_group_id_fkey` FOREIGN KEY (`denomination_id`, `work_group_id`) REFERENCES `work_groups`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `work_teams` ADD CONSTRAINT `work_teams_denomination_id_work_block_id_fkey` FOREIGN KEY (`denomination_id`, `work_block_id`) REFERENCES `work_blocks`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `work_team_members` ADD CONSTRAINT `work_team_members_denomination_id_member_id_fkey` FOREIGN KEY (`denomination_id`, `member_id`) REFERENCES `members`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `work_team_members` ADD CONSTRAINT `work_team_members_denomination_id_work_team_id_fkey` FOREIGN KEY (`denomination_id`, `work_team_id`) REFERENCES `work_teams`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `schedules` ADD CONSTRAINT `schedules_denomination_id_work_team_id_fkey` FOREIGN KEY (`denomination_id`, `work_team_id`) REFERENCES `work_teams`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `topics` ADD CONSTRAINT `topics_denomination_id_fkey` FOREIGN KEY (`denomination_id`) REFERENCES `denominations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `schedule_topics` ADD CONSTRAINT `schedule_topics_denomination_id_schedule_id_fkey` FOREIGN KEY (`denomination_id`, `schedule_id`) REFERENCES `schedules`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `schedule_topics` ADD CONSTRAINT `schedule_topics_denomination_id_topic_id_fkey` FOREIGN KEY (`denomination_id`, `topic_id`) REFERENCES `topics`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `schedule_topics` ADD CONSTRAINT `schedule_topics_denomination_id_responsible_id_fkey` FOREIGN KEY (`denomination_id`, `responsible_id`) REFERENCES `members`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `regions` ADD CONSTRAINT `regions_country_id_fkey` FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `municipalities` ADD CONSTRAINT `municipalities_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `neighborhoods` ADD CONSTRAINT `neighborhoods_municipality_id_fkey` FOREIGN KEY (`municipality_id`) REFERENCES `municipalities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `legal_entities` ADD CONSTRAINT `legal_entities_denomination_id_fkey` FOREIGN KEY (`denomination_id`) REFERENCES `denominations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `legal_entities` ADD CONSTRAINT `legal_entities_country_id_fkey` FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `legal_entities` ADD CONSTRAINT `legal_entities_municipality_id_fkey` FOREIGN KEY (`municipality_id`) REFERENCES `municipalities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `districts` ADD CONSTRAINT `districts_denomination_id_fkey` FOREIGN KEY (`denomination_id`) REFERENCES `denominations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `congregations` ADD CONSTRAINT `congregations_denomination_id_fkey` FOREIGN KEY (`denomination_id`) REFERENCES `denominations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `congregations` ADD CONSTRAINT `congregations_denomination_id_legal_entity_id_fkey` FOREIGN KEY (`denomination_id`, `legal_entity_id`) REFERENCES `legal_entities`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `congregations` ADD CONSTRAINT `congregations_denomination_id_district_id_fkey` FOREIGN KEY (`denomination_id`, `district_id`) REFERENCES `districts`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `congregations` ADD CONSTRAINT `congregations_municipality_id_fkey` FOREIGN KEY (`municipality_id`) REFERENCES `municipalities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `congregations` ADD CONSTRAINT `congregations_neighborhood_id_fkey` FOREIGN KEY (`neighborhood_id`) REFERENCES `neighborhoods`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `pastoral_terms` ADD CONSTRAINT `pastoral_terms_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `pastoral_terms` ADD CONSTRAINT `pastoral_terms_denomination_id_pastor_id_fkey` FOREIGN KEY (`denomination_id`, `pastor_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `marriages` ADD CONSTRAINT `marriages_denomination_id_spouse1_id_fkey` FOREIGN KEY (`denomination_id`, `spouse1_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `marriages` ADD CONSTRAINT `marriages_denomination_id_spouse2_id_fkey` FOREIGN KEY (`denomination_id`, `spouse2_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `marriages` ADD CONSTRAINT `marriages_denomination_id_officiant_id_fkey` FOREIGN KEY (`denomination_id`, `officiant_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `child_dedications` ADD CONSTRAINT `child_dedications_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `child_dedications` ADD CONSTRAINT `child_dedications_denomination_id_child_id_fkey` FOREIGN KEY (`denomination_id`, `child_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `child_dedications` ADD CONSTRAINT `child_dedications_denomination_id_pastor_id_fkey` FOREIGN KEY (`denomination_id`, `pastor_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_meeting_type_id_fkey` FOREIGN KEY (`meeting_type_id`) REFERENCES `meeting_types`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_recorded_by_id_fkey` FOREIGN KEY (`recorded_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendance_counts` ADD CONSTRAINT `attendance_counts_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendance_counts` ADD CONSTRAINT `attendance_counts_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `attendance_categories`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `certificate_types` ADD CONSTRAINT `certificate_types_denomination_id_fkey` FOREIGN KEY (`denomination_id`) REFERENCES `denominations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `document_sequences` ADD CONSTRAINT `document_sequences_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_denomination_id_certificate_type_id_fkey` FOREIGN KEY (`denomination_id`, `certificate_type_id`) REFERENCES `certificate_types`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_denomination_id_member_id_fkey` FOREIGN KEY (`denomination_id`, `member_id`) REFERENCES `members`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_denomination_id_pastor_signer_id_fkey` FOREIGN KEY (`denomination_id`, `pastor_signer_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_denomination_id_secretary_signer_id_fkey` FOREIGN KEY (`denomination_id`, `secretary_signer_id`) REFERENCES `persons`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_issued_by_id_fkey` FOREIGN KEY (`issued_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `membership_cards` ADD CONSTRAINT `membership_cards_denomination_id_member_id_fkey` FOREIGN KEY (`denomination_id`, `member_id`) REFERENCES `members`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `membership_cards` ADD CONSTRAINT `membership_cards_denomination_id_congregation_id_fkey` FOREIGN KEY (`denomination_id`, `congregation_id`) REFERENCES `congregations`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Reglas CHECK que Prisma no puede expresar (fuente: prisma/sql/constraints.sql).
-- ---------------------------------------------------------------------------
-- Reglas que Prisma no puede expresar en el esquema.
-- Se agregan al final de la migración inicial (ver backend/README.md).

ALTER TABLE `contributions`
  ADD CONSTRAINT `chk_contributions_amount` CHECK (`amount` > 0),
  -- Un voto siempre es de una persona. Sin esto, la FK compuesta no se verificaría con person_id NULL.
  ADD CONSTRAINT `chk_contributions_vow_person` CHECK (`vow_pledge_id` IS NULL OR `person_id` IS NOT NULL),
  ADD CONSTRAINT `chk_contributions_void` CHECK (
    (`status` = 'VOIDED') = (`voided_at` IS NOT NULL AND `voided_by_id` IS NOT NULL AND `void_reason` IS NOT NULL)
  );

ALTER TABLE `cash_transactions`
  ADD CONSTRAINT `chk_cash_transactions_amount` CHECK (`amount` > 0);

ALTER TABLE `vow_pledges`
  ADD CONSTRAINT `chk_vow_pledges_amount` CHECK (`pledged_amount` > 0);

ALTER TABLE `budget_lines`
  ADD CONSTRAINT `chk_budget_lines_amount` CHECK (`annual_amount` >= 0);

ALTER TABLE `accounting_periods`
  ADD CONSTRAINT `chk_accounting_periods_month` CHECK (`month` BETWEEN 1 AND 12);

ALTER TABLE `tithe_settlement_rules`
  ADD CONSTRAINT `chk_tithe_rules_rates` CHECK (
    `national_share_rate` BETWEEN 0 AND 1 AND `local_fund_rate` BETWEEN 0 AND 1
  );

ALTER TABLE `tithe_settlements`
  -- Los tres componentes de la liquidación deben sumar el diezmo bruto.
  ADD CONSTRAINT `chk_tithe_settlements_total` CHECK (
    `national_share` + `local_fund_share` + `pastor_net` = `gross_tithe`
  ),
  ADD CONSTRAINT `chk_tithe_settlements_shares` CHECK (
    `national_share` >= 0 AND `local_fund_share` >= 0 AND `pastor_net` >= 0
  ),
  ADD CONSTRAINT `chk_tithe_settlements_range` CHECK (`covered_from` <= `covered_to`);

ALTER TABLE `attendance_counts`
  ADD CONSTRAINT `chk_attendance_counts_headcount` CHECK (`headcount` >= 0);

-- Con un orden fijo, una misma pareja no se puede registrar en ambos sentidos.
ALTER TABLE `marriages`
  ADD CONSTRAINT `chk_marriages_spouses` CHECK (`spouse1_id` < `spouse2_id`);

ALTER TABLE `family_relations`
  ADD CONSTRAINT `chk_family_relations_people` CHECK (`person_id` <> `relative_id`);

-- Un índice único no protege si falta el tipo: tipo y número van siempre juntos.
ALTER TABLE `persons`
  ADD CONSTRAINT `chk_persons_document` CHECK (
    (`document_type_id` IS NULL) = (`document_number` IS NULL)
  );

ALTER TABLE `member_transfers`
  ADD CONSTRAINT `chk_member_transfers_congregations` CHECK (
    `origin_congregation_id` <> `destination_congregation_id`
  ),
  ADD CONSTRAINT `chk_member_transfers_destination` CHECK (
    `destination_congregation_id` IS NOT NULL OR `external_destination_name` IS NOT NULL
  );

ALTER TABLE `user_roles`
  -- El alcance del rol debe coincidir con las columnas que lo identifican y con su clave.
  ADD CONSTRAINT `chk_user_roles_scope` CHECK (
    (`scope` = 'PLATFORM' AND `denomination_id` IS NULL AND `congregation_id` IS NULL AND `scope_key` = 'P')
    OR (`scope` = 'DENOMINATION' AND `denomination_id` IS NOT NULL AND `congregation_id` IS NULL
        AND `scope_key` = CONCAT('D:', `denomination_id`))
    OR (`scope` = 'CONGREGATION' AND `denomination_id` IS NOT NULL AND `congregation_id` IS NOT NULL
        AND `scope_key` = CONCAT('C:', `congregation_id`))
  ),
  -- Un rol vigente ocupa la clave única; al revocarlo, la libera para poder concederlo de nuevo.
  ADD CONSTRAINT `chk_user_roles_active` CHECK (
    (`revoked_at` IS NULL AND `active_key` = 1) OR (`revoked_at` IS NOT NULL AND `active_key` IS NULL)
  );

-- Migración 20261102150000_api_support_fields: reglas de los campos que agrega.
ALTER TABLE `privacy_policies`
  -- Solo una política publicada tiene fecha de publicación.
  ADD CONSTRAINT `chk_privacy_policies_published` CHECK (
    (`status` = 'PUBLISHED') = (`published_at` IS NOT NULL)
  );

ALTER TABLE `membership_cards`
  -- Un carné anulado siempre tiene motivo, y un motivo solo existe si fue anulado.
  ADD CONSTRAINT `chk_membership_cards_void` CHECK (
    (`voided_at` IS NULL) = (`void_reason` IS NULL)
  );

ALTER TABLE `certificates`
  ADD CONSTRAINT `chk_certificates_void_reason` CHECK (
    `void_reason` IS NULL OR `voided_at` IS NOT NULL
  );

ALTER TABLE `marriages`
  -- El oficiante no puede ser uno de los contrayentes.
  ADD CONSTRAINT `chk_marriages_officiant` CHECK (
    `officiant_id` IS NULL OR (`officiant_id` <> `spouse1_id` AND `officiant_id` <> `spouse2_id`)
  );

ALTER TABLE `person_studies`
  ADD CONSTRAINT `chk_person_studies_year` CHECK (`year` IS NULL OR `year` BETWEEN 1900 AND 2200);
