/**
 * User-facing messages for the CHECK rules of prisma/sql/constraints.sql. The use cases validate first;
 * this table is the safety net when a rule is violated anyway, so the answer is a 422 and not a 500.
 */
export const CHECK_CONSTRAINT_MESSAGES: Readonly<Record<string, string>> = {
  chk_contributions_amount: 'El valor del aporte debe ser mayor que cero.',
  chk_contributions_vow_person: 'Un aporte a un voto debe tener una persona.',
  chk_contributions_void:
    'Un aporte anulado debe registrar quién lo anuló, cuándo y el motivo.',
  chk_cash_transactions_amount:
    'El valor del movimiento debe ser mayor que cero.',
  chk_vow_pledges_amount: 'El valor del voto debe ser mayor que cero.',
  chk_budget_lines_amount: 'El valor presupuestado no puede ser negativo.',
  chk_accounting_periods_month: 'El mes del periodo debe estar entre 1 y 12.',
  chk_tithe_rules_rates:
    'Los porcentajes del diezmo deben estar entre 0 y 100.',
  chk_tithe_settlements_total:
    'La liquidación del diezmo no suma el valor bruto del diezmo.',
  chk_tithe_settlements_shares:
    'Los componentes de la liquidación del diezmo no pueden ser negativos.',
  chk_tithe_settlements_range:
    'La fecha inicial de la liquidación no puede ser posterior a la final.',
  chk_attendance_counts_headcount: 'La asistencia no puede ser negativa.',
  chk_marriages_spouses: 'Los cónyuges no son válidos.',
  chk_marriages_officiant: 'El oficiante no puede ser uno de los cónyuges.',
  chk_family_relations_people: 'Una persona no puede ser pariente de sí misma.',
  chk_persons_document:
    'El tipo y el número de documento deben registrarse juntos.',
  chk_member_transfers_congregations:
    'La sede de origen y la de destino deben ser distintas.',
  chk_member_transfers_destination:
    'El traslado necesita una sede de destino o el nombre de la iglesia externa.',
  chk_user_roles_scope: 'El alcance del rol no es coherente.',
  chk_user_roles_active: 'El estado del rol no es coherente.',
  chk_privacy_policies_published:
    'Solo una política publicada puede tener fecha de publicación.',
  chk_membership_cards_void: 'Un carné anulado debe tener motivo.',
  chk_certificates_void_reason:
    'Solo un certificado anulado puede tener motivo de anulación.',
  chk_person_studies_year: 'El año del estudio no es válido.',
};

export const GENERIC_CHECK_MESSAGE =
  'Los datos no cumplen una regla de validación.';

// MariaDB: "CONSTRAINT `chk_name` failed for `database`.`table`". Only the name is used, never the rest.
const CONSTRAINT_NAME = /CONSTRAINT [`'"]?(\w+)[`'"]? failed/i;

export function checkConstraintName(message: string): string | null {
  return CONSTRAINT_NAME.exec(message)?.[1] ?? null;
}
