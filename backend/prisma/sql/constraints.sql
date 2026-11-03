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
