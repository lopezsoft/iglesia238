-- CreateTable
CREATE TABLE `funds` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `funds_denomination_id_name_key`(`denomination_id`, `name`),
    UNIQUE INDEX `funds_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `default_fund_id` INTEGER NULL,
    `parent_id` INTEGER NULL,
    `code` VARCHAR(20) NOT NULL,
    `legacy_code` VARCHAR(20) NULL,
    `name` VARCHAR(150) NOT NULL,
    `nature` ENUM('INCOME', 'EXPENSE') NOT NULL,
    `is_postable` BOOLEAN NOT NULL DEFAULT true,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `accounts_denomination_id_code_key`(`denomination_id`, `code`),
    UNIQUE INDEX `accounts_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contribution_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `category` ENUM('TITHE', 'OFFERING', 'FIRST_FRUITS', 'VOW', 'OTHER') NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `account_id` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `contribution_types_denomination_id_code_key`(`denomination_id`, `code`),
    UNIQUE INDEX `contribution_types_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fund_opening_balances` (
    `denomination_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `fund_id` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,

    PRIMARY KEY (`congregation_id`, `fund_id`, `year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounting_periods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `closed_at` DATETIME(3) NULL,

    UNIQUE INDEX `accounting_periods_congregation_id_year_month_key`(`congregation_id`, `year`, `month`),
    UNIQUE INDEX `accounting_periods_denomination_id_congregation_id_id_key`(`denomination_id`, `congregation_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vouchers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `type` VARCHAR(30) NOT NULL,
    `number` INTEGER NOT NULL,
    `issued_on` DATE NOT NULL,
    `signer_id` INTEGER NULL,
    `voided_at` DATETIME(3) NULL,
    `void_reason` VARCHAR(255) NULL,

    UNIQUE INDEX `vouchers_congregation_id_type_number_key`(`congregation_id`, `type`, `number`),
    UNIQUE INDEX `vouchers_denomination_id_congregation_id_id_key`(`denomination_id`, `congregation_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cash_transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `period_id` INTEGER NOT NULL,
    `account_id` INTEGER NOT NULL,
    `fund_id` INTEGER NOT NULL,
    `voucher_id` INTEGER NULL,
    `direction` ENUM('IN', 'OUT') NOT NULL,
    `posted_on` DATE NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `reversal_of_id` INTEGER NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `cash_transactions_period_id_posted_on_idx`(`period_id`, `posted_on`),
    INDEX `cash_transactions_account_id_posted_on_idx`(`account_id`, `posted_on`),
    INDEX `cash_transactions_fund_id_posted_on_idx`(`fund_id`, `posted_on`),
    UNIQUE INDEX `cash_transactions_denomination_id_congregation_id_id_key`(`denomination_id`, `congregation_id`, `id`),
    UNIQUE INDEX `cash_transactions_denomination_id_congregation_id_reversal_o_key`(`denomination_id`, `congregation_id`, `reversal_of_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vow_pledges` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `person_id` INTEGER NOT NULL,
    `contribution_type_id` INTEGER NOT NULL,
    `description` VARCHAR(255) NULL,
    `pledged_amount` DECIMAL(14, 2) NOT NULL,
    `pledged_on` DATE NOT NULL,
    `due_on` DATE NULL,
    `status` ENUM('ACTIVE', 'FULFILLED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `vow_pledges_person_id_status_idx`(`person_id`, `status`),
    INDEX `vow_pledges_congregation_id_status_idx`(`congregation_id`, `status`),
    UNIQUE INDEX `vow_pledges_denomination_id_id_key`(`denomination_id`, `id`),
    UNIQUE INDEX `vow_pledges_denomination_id_person_id_contribution_type_id_i_key`(`denomination_id`, `person_id`, `contribution_type_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contributions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `contribution_type_id` INTEGER NOT NULL,
    `person_id` INTEGER NULL,
    `vow_pledge_id` INTEGER NULL,
    `cash_transaction_id` INTEGER NULL,
    `voucher_id` INTEGER NULL,
    `tithe_settlement_id` INTEGER NULL,
    `received_on` DATE NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `payment_method` ENUM('CASH', 'BANK_TRANSFER', 'CARD', 'BANK_DEPOSIT', 'OTHER') NOT NULL DEFAULT 'CASH',
    `payment_reference` VARCHAR(80) NULL,
    `notes` VARCHAR(255) NULL,
    `status` ENUM('RECORDED', 'VOIDED') NOT NULL DEFAULT 'RECORDED',
    `recorded_by_id` INTEGER NOT NULL,
    `voided_by_id` INTEGER NULL,
    `voided_at` DATETIME(3) NULL,
    `void_reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `contributions_congregation_id_received_on_idx`(`congregation_id`, `received_on`),
    INDEX `contributions_congregation_id_contribution_type_id_received__idx`(`congregation_id`, `contribution_type_id`, `received_on`),
    INDEX `contributions_denomination_id_received_on_idx`(`denomination_id`, `received_on`),
    INDEX `contributions_person_id_received_on_idx`(`person_id`, `received_on`),
    INDEX `contributions_vow_pledge_id_idx`(`vow_pledge_id`),
    INDEX `contributions_cash_transaction_id_idx`(`cash_transaction_id`),
    INDEX `contributions_tithe_settlement_id_idx`(`tithe_settlement_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tithe_settlement_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `effective_from` DATE NOT NULL,
    `national_share_rate` DECIMAL(5, 4) NOT NULL,
    `local_fund_rate` DECIMAL(5, 4) NOT NULL,

    UNIQUE INDEX `tithe_settlement_rules_denomination_id_effective_from_key`(`denomination_id`, `effective_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tithe_settlements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `voucher_id` INTEGER NULL,
    `pastor_id` INTEGER NULL,
    `settled_on` DATE NOT NULL,
    `covered_from` DATE NOT NULL,
    `covered_to` DATE NOT NULL,
    `gross_tithe` DECIMAL(14, 2) NOT NULL,
    `national_share_rate` DECIMAL(5, 4) NOT NULL,
    `local_fund_rate` DECIMAL(5, 4) NOT NULL,
    `national_share` DECIMAL(14, 2) NOT NULL,
    `local_fund_share` DECIMAL(14, 2) NOT NULL,
    `pastor_net` DECIMAL(14, 2) NOT NULL,
    `status` ENUM('ISSUED', 'VOIDED') NOT NULL DEFAULT 'ISSUED',
    `voided_by_id` INTEGER NULL,
    `voided_at` DATETIME(3) NULL,
    `void_reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tithe_settlements_congregation_id_settled_on_idx`(`congregation_id`, `settled_on`),
    INDEX `tithe_settlements_congregation_id_covered_from_covered_to_idx`(`congregation_id`, `covered_from`, `covered_to`),
    UNIQUE INDEX `tithe_settlements_denomination_id_congregation_id_id_key`(`denomination_id`, `congregation_id`, `id`),
    UNIQUE INDEX `tithe_settlements_denomination_id_congregation_id_voucher_id_key`(`denomination_id`, `congregation_id`, `voucher_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budgets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `type` ENUM('FIXED', 'COMMITTEE') NOT NULL,
    `income_increase_rate` DECIMAL(5, 4) NULL,
    `status` ENUM('DRAFT', 'APPROVED', 'CLOSED') NOT NULL DEFAULT 'DRAFT',

    UNIQUE INDEX `budgets_congregation_id_year_type_key`(`congregation_id`, `year`, `type`),
    UNIQUE INDEX `budgets_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `budget_id` INTEGER NOT NULL,
    `account_id` INTEGER NOT NULL,
    `fund_id` INTEGER NOT NULL,
    `monthly_amount` DECIMAL(14, 2) NULL,
    `annual_amount` DECIMAL(14, 2) NOT NULL,

    UNIQUE INDEX `budget_lines_budget_id_account_id_fund_id_key`(`budget_id`, `account_id`, `fund_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `display_name` VARCHAR(150) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `email_verified_at` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `failed_login_attempts` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `roles_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(80) NOT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `permissions_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` INTEGER NOT NULL,
    `permission_id` INTEGER NOT NULL,

    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `role_id` INTEGER NOT NULL,
    `scope` ENUM('PLATFORM', 'DENOMINATION', 'CONGREGATION') NOT NULL,
    `denomination_id` INTEGER NULL,
    `congregation_id` INTEGER NULL,
    `scope_key` VARCHAR(40) NOT NULL,
    `active_key` BOOLEAN NULL DEFAULT true,
    `granted_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` DATETIME(3) NULL,

    INDEX `user_roles_denomination_id_congregation_id_idx`(`denomination_id`, `congregation_id`),
    UNIQUE INDEX `user_roles_user_id_role_id_scope_key_active_key_key`(`user_id`, `role_id`, `scope_key`, `active_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `family` VARCHAR(36) NOT NULL,
    `token_hash` VARCHAR(128) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_user_id_idx`(`user_id`),
    INDEX `refresh_tokens_family_idx`(`family`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `type` ENUM('EMAIL_VERIFICATION', 'PASSWORD_RESET') NOT NULL,
    `token_hash` VARCHAR(128) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_tokens_token_hash_key`(`token_hash`),
    INDEX `user_tokens_user_id_type_idx`(`user_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `denomination_id` INTEGER NULL,
    `congregation_id` INTEGER NULL,
    `entity` VARCHAR(80) NOT NULL,
    `entity_id` VARCHAR(40) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `changes` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_denomination_id_entity_entity_id_idx`(`denomination_id`, `entity`, `entity_id`),
    INDEX `audit_logs_denomination_id_created_at_idx`(`denomination_id`, `created_at`),
    INDEX `audit_logs_congregation_id_created_at_idx`(`congregation_id`, `created_at`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(10) NOT NULL,
    `name` VARCHAR(80) NOT NULL,

    UNIQUE INDEX `document_types_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `marital_statuses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(80) NOT NULL,

    UNIQUE INDEX `marital_statuses_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `education_levels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(80) NOT NULL,

    UNIQUE INDEX `education_levels_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `study_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(80) NOT NULL,

    UNIQUE INDEX `study_types_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pastoral_ranks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `pastoral_ranks_denomination_id_name_key`(`denomination_id`, `name`),
    UNIQUE INDEX `pastoral_ranks_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `studies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `study_type_id` INTEGER NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `studies_denomination_id_study_type_id_name_key`(`denomination_id`, `study_type_id`, `name`),
    UNIQUE INDEX `studies_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `church_positions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `church_positions_denomination_id_name_key`(`denomination_id`, `name`),
    UNIQUE INDEX `church_positions_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `persons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `user_id` INTEGER NULL,
    `document_type_id` INTEGER NULL,
    `document_number` VARCHAR(30) NULL,
    `document_issue_place_id` INTEGER NULL,
    `document_issue_place_text` VARCHAR(150) NULL,
    `full_name` VARCHAR(200) NULL,
    `first_name` VARCHAR(100) NULL,
    `last_name` VARCHAR(80) NULL,
    `second_last_name` VARCHAR(80) NULL,
    `sex` ENUM('FEMALE', 'MALE') NULL,
    `birth_date` DATE NULL,
    `birth_place_id` INTEGER NULL,
    `birth_place_text` VARCHAR(150) NULL,
    `marital_status_id` INTEGER NULL,
    `education_level_id` INTEGER NULL,
    `last_grade_completed` INTEGER NULL,
    `profession` VARCHAR(120) NULL,
    `occupation` VARCHAR(120) NULL,
    `workplace` VARCHAR(150) NULL,
    `children_count` INTEGER NULL,
    `photo_path` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `persons_denomination_id_document_number_idx`(`denomination_id`, `document_number`),
    INDEX `persons_denomination_id_last_name_first_name_idx`(`denomination_id`, `last_name`, `first_name`),
    INDEX `persons_denomination_id_birth_date_idx`(`denomination_id`, `birth_date`),
    UNIQUE INDEX `persons_denomination_id_id_key`(`denomination_id`, `id`),
    UNIQUE INDEX `persons_denomination_id_document_type_id_document_number_key`(`denomination_id`, `document_type_id`, `document_number`),
    UNIQUE INDEX `persons_denomination_id_user_id_key`(`denomination_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `person_addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `person_id` INTEGER NOT NULL,
    `municipality_id` INTEGER NULL,
    `neighborhood_id` INTEGER NULL,
    `address` VARCHAR(200) NOT NULL,
    `is_current` BOOLEAN NOT NULL DEFAULT true,

    INDEX `person_addresses_person_id_is_current_idx`(`person_id`, `is_current`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `person_contacts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `person_id` INTEGER NOT NULL,
    `type` ENUM('LANDLINE', 'MOBILE', 'EMAIL', 'WORK_PHONE') NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,

    INDEX `person_contacts_person_id_type_idx`(`person_id`, `type`),
    INDEX `person_contacts_denomination_id_value_idx`(`denomination_id`, `value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `socioeconomic_profiles` (
    `person_id` INTEGER NOT NULL,
    `denomination_id` INTEGER NOT NULL,
    `has_health_coverage` BOOLEAN NULL,
    `has_pension` BOOLEAN NULL,
    `has_occupational_risk_coverage` BOOLEAN NULL,
    `is_subsidized_regime` BOOLEAN NULL,
    `has_family_compensation` BOOLEAN NULL,
    `sisben_level` INTEGER NULL,
    `is_displaced` BOOLEAN NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `socioeconomic_profiles_denomination_id_person_id_key`(`denomination_id`, `person_id`),
    PRIMARY KEY (`person_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `family_relations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `person_id` INTEGER NOT NULL,
    `relative_id` INTEGER NOT NULL,
    `type` ENUM('FATHER', 'MOTHER', 'CHILD', 'GUARDIAN') NOT NULL,

    UNIQUE INDEX `family_relations_person_id_relative_id_type_key`(`person_id`, `relative_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `person_studies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `person_id` INTEGER NOT NULL,
    `study_id` INTEGER NOT NULL,
    `status` ENUM('IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'COMPLETED',
    `completed_on` DATE NULL,

    UNIQUE INDEX `person_studies_person_id_study_id_key`(`person_id`, `study_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `person_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED') NOT NULL DEFAULT 'ACTIVE',
    `joined_on` DATE NULL,
    `converted_on` DATE NULL,
    `is_baptized` BOOLEAN NULL,
    `water_baptism_on` DATE NULL,
    `baptism_place` VARCHAR(150) NULL,
    `baptizing_pastor_id` INTEGER NULL,
    `holy_spirit_baptism_on` DATE NULL,
    `reconciled_on` DATE NULL,
    `previous_congregation_name` VARCHAR(150) NULL,
    `pastoral_rank_id` INTEGER NULL,
    `is_christian_education_teacher` BOOLEAN NOT NULL DEFAULT false,
    `desired_areas` VARCHAR(255) NULL,
    `pastor_notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `members_person_id_key`(`person_id`),
    INDEX `members_congregation_id_status_idx`(`congregation_id`, `status`),
    UNIQUE INDEX `members_denomination_id_id_key`(`denomination_id`, `id`),
    UNIQUE INDEX `members_denomination_id_person_id_key`(`denomination_id`, `person_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_registry_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `member_number` INTEGER NOT NULL,
    `legacy_code` INTEGER NULL,
    `registry_book` VARCHAR(20) NULL,
    `registry_folio` VARCHAR(20) NULL,
    `started_on` DATE NOT NULL,
    `ended_on` DATE NULL,

    INDEX `member_registry_entries_member_id_idx`(`member_id`),
    INDEX `member_registry_entries_congregation_id_registry_book_regist_idx`(`congregation_id`, `registry_book`, `registry_folio`),
    UNIQUE INDEX `member_registry_entries_congregation_id_member_number_key`(`congregation_id`, `member_number`),
    UNIQUE INDEX `member_registry_entries_congregation_id_legacy_code_key`(`congregation_id`, `legacy_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_status_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `user_id` INTEGER NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED') NOT NULL,
    `started_on` DATE NOT NULL,
    `reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `member_status_history_member_id_started_on_idx`(`member_id`, `started_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_transfers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `origin_congregation_id` INTEGER NOT NULL,
    `destination_congregation_id` INTEGER NULL,
    `external_destination_name` VARCHAR(150) NULL,
    `status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
    `transfer_date` DATE NOT NULL,
    `approved_by_id` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `certificate_id` INTEGER NULL,
    `notes` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `member_transfers_member_id_idx`(`member_id`),
    INDEX `member_transfers_destination_congregation_id_status_idx`(`destination_congregation_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_positions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `position_id` INTEGER NOT NULL,
    `started_on` DATE NULL,
    `ended_on` DATE NULL,

    INDEX `member_positions_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `privacy_policies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `version` VARCHAR(20) NOT NULL,
    `content` TEXT NOT NULL,
    `effective_from` DATE NOT NULL,

    UNIQUE INDEX `privacy_policies_denomination_id_version_key`(`denomination_id`, `version`),
    UNIQUE INDEX `privacy_policies_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `data_consents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `person_id` INTEGER NOT NULL,
    `guardian_id` INTEGER NULL,
    `policy_id` INTEGER NOT NULL,
    `channel` ENUM('WEB_FORM', 'PAPER') NOT NULL,
    `granted_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,

    INDEX `data_consents_person_id_idx`(`person_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `person_attachments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `person_id` INTEGER NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `storage_path` VARCHAR(255) NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `person_attachments_person_id_idx`(`person_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `membership_applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `policy_id` INTEGER NOT NULL,
    `tracking_code_hash` VARCHAR(128) NOT NULL,
    `status` ENUM('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'DUPLICATE') NOT NULL DEFAULT 'PENDING',
    `document_type_id` INTEGER NULL,
    `document_number` VARCHAR(30) NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(160) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(30) NULL,
    `birth_date` DATE NULL,
    `guardian_name` VARCHAR(200) NULL,
    `guardian_document` VARCHAR(30) NULL,
    `form_data` JSON NOT NULL,
    `consented_at` DATETIME(3) NOT NULL,
    `reviewer_id` INTEGER NULL,
    `reviewed_at` DATETIME(3) NULL,
    `rejection_reason` VARCHAR(255) NULL,
    `matched_person_id` INTEGER NULL,
    `member_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `membership_applications_tracking_code_hash_key`(`tracking_code_hash`),
    INDEX `membership_applications_congregation_id_status_created_at_idx`(`congregation_id`, `status`, `created_at`),
    INDEX `membership_applications_denomination_id_document_type_id_doc_idx`(`denomination_id`, `document_type_id`, `document_number`),
    UNIQUE INDEX `membership_applications_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `application_attachments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `application_id` INTEGER NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `storage_path` VARCHAR(255) NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `application_attachments_application_id_idx`(`application_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ministries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `ministries_congregation_id_name_key`(`congregation_id`, `name`),
    UNIQUE INDEX `ministries_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `work_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `ministry_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,

    UNIQUE INDEX `work_groups_ministry_id_name_key`(`ministry_id`, `name`),
    UNIQUE INDEX `work_groups_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `work_blocks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `work_group_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,

    UNIQUE INDEX `work_blocks_work_group_id_name_key`(`work_group_id`, `name`),
    UNIQUE INDEX `work_blocks_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `work_teams` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `work_block_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,

    UNIQUE INDEX `work_teams_work_block_id_name_key`(`work_block_id`, `name`),
    UNIQUE INDEX `work_teams_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `work_team_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `work_team_id` INTEGER NOT NULL,
    `team_role` VARCHAR(80) NULL,
    `started_on` DATE NOT NULL,
    `ended_on` DATE NULL,

    INDEX `work_team_members_member_id_idx`(`member_id`),
    INDEX `work_team_members_work_team_id_idx`(`work_team_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `work_team_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `starts_on` DATE NOT NULL,
    `ends_on` DATE NULL,

    INDEX `schedules_work_team_id_idx`(`work_team_id`),
    UNIQUE INDEX `schedules_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `topics` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,

    UNIQUE INDEX `topics_denomination_id_title_key`(`denomination_id`, `title`),
    UNIQUE INDEX `topics_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedule_topics` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `schedule_id` INTEGER NOT NULL,
    `topic_id` INTEGER NOT NULL,
    `scheduled_on` DATE NOT NULL,
    `responsible_id` INTEGER NULL,

    INDEX `schedule_topics_schedule_id_scheduled_on_idx`(`schedule_id`, `scheduled_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `countries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `iso_code` VARCHAR(3) NOT NULL,
    `name` VARCHAR(100) NOT NULL,

    UNIQUE INDEX `countries_iso_code_key`(`iso_code`),
    UNIQUE INDEX `countries_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `regions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `country_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,

    UNIQUE INDEX `regions_country_id_name_key`(`country_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `municipalities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `region_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,

    UNIQUE INDEX `municipalities_region_id_name_key`(`region_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `neighborhoods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `municipality_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,

    UNIQUE INDEX `neighborhoods_municipality_id_name_key`(`municipality_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `denominations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `logo_path` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `denominations_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `legal_entities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `legal_name` VARCHAR(200) NOT NULL,
    `trade_name` VARCHAR(200) NULL,
    `tax_id` VARCHAR(30) NOT NULL,
    `legal_representative` VARCHAR(200) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(30) NULL,
    `address` VARCHAR(200) NULL,
    `municipality_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `legal_entities_tax_id_key`(`tax_id`),
    UNIQUE INDEX `legal_entities_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `districts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `name` VARCHAR(150) NULL,

    UNIQUE INDEX `districts_denomination_id_number_key`(`denomination_id`, `number`),
    UNIQUE INDEX `districts_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `congregations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `legal_entity_id` INTEGER NOT NULL,
    `district_id` INTEGER NULL,
    `municipality_id` INTEGER NULL,
    `neighborhood_id` INTEGER NULL,
    `name` VARCHAR(150) NOT NULL,
    `address` VARCHAR(200) NULL,
    `phone` VARCHAR(30) NULL,
    `email` VARCHAR(191) NULL,
    `accepts_applications` BOOLEAN NOT NULL DEFAULT true,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `congregations_denomination_id_accepts_applications_is_active_idx`(`denomination_id`, `accepts_applications`, `is_active`),
    UNIQUE INDEX `congregations_denomination_id_name_key`(`denomination_id`, `name`),
    UNIQUE INDEX `congregations_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pastoral_terms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `pastor_id` INTEGER NOT NULL,
    `started_on` DATE NOT NULL,
    `ended_on` DATE NULL,

    INDEX `pastoral_terms_congregation_id_started_on_idx`(`congregation_id`, `started_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `marriages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `spouse1_id` INTEGER NOT NULL,
    `spouse2_id` INTEGER NOT NULL,
    `is_civil` BOOLEAN NOT NULL DEFAULT false,
    `is_christian` BOOLEAN NOT NULL DEFAULT false,
    `is_catholic` BOOLEAN NOT NULL DEFAULT false,
    `registered_with` ENUM('NOTARY', 'CHURCH') NULL,
    `married_on` DATE NULL,
    `ended_on` DATE NULL,
    `end_reason` ENUM('DIVORCE', 'DEATH', 'ANNULMENT') NULL,
    `tribunal_opinion` VARCHAR(255) NULL,

    INDEX `marriages_spouse1_id_idx`(`spouse1_id`),
    INDEX `marriages_spouse2_id_idx`(`spouse2_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `child_dedications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `child_id` INTEGER NOT NULL,
    `pastor_id` INTEGER NULL,
    `dedicated_on` DATE NOT NULL,

    INDEX `child_dedications_congregation_id_dedicated_on_idx`(`congregation_id`, `dedicated_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meeting_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(80) NOT NULL,

    UNIQUE INDEX `meeting_types_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(80) NOT NULL,

    UNIQUE INDEX `attendance_categories_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `meeting_type_id` INTEGER NOT NULL,
    `session_date` DATE NOT NULL,

    UNIQUE INDEX `attendance_sessions_congregation_id_meeting_type_id_session__key`(`congregation_id`, `meeting_type_id`, `session_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_counts` (
    `session_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL,
    `headcount` INTEGER NOT NULL,

    PRIMARY KEY (`session_id`, `category_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `certificate_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `template` TEXT NULL,
    `validity_days` INTEGER NULL,

    UNIQUE INDEX `certificate_types_denomination_id_code_key`(`denomination_id`, `code`),
    UNIQUE INDEX `certificate_types_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_sequences` (
    `denomination_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `last_value` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`congregation_id`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `certificates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `congregation_id` INTEGER NOT NULL,
    `certificate_type_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `sequence_number` INTEGER NOT NULL,
    `issued_on` DATE NOT NULL,
    `expires_on` DATE NULL,
    `valid_for` VARCHAR(150) NULL,
    `notes` VARCHAR(255) NULL,
    `pastor_signer_id` INTEGER NOT NULL,
    `secretary_signer_id` INTEGER NULL,
    `snapshot` JSON NOT NULL,
    `voided_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `certificates_member_id_idx`(`member_id`),
    INDEX `certificates_congregation_id_issued_on_idx`(`congregation_id`, `issued_on`),
    UNIQUE INDEX `certificates_congregation_id_certificate_type_id_sequence_nu_key`(`congregation_id`, `certificate_type_id`, `sequence_number`),
    UNIQUE INDEX `certificates_denomination_id_id_key`(`denomination_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `membership_cards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `denomination_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `issued_on` DATE NOT NULL,
    `expires_on` DATE NOT NULL,

    INDEX `membership_cards_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
ALTER TABLE `membership_cards` ADD CONSTRAINT `membership_cards_denomination_id_member_id_fkey` FOREIGN KEY (`denomination_id`, `member_id`) REFERENCES `members`(`denomination_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

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
