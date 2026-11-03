import { Permission } from '../permission';
import { RoleAssignment, Scope, SessionUser } from '../session.model';

export const SEDE_UNO: Scope = { kind: 'CONGREGATION', denominationId: 1, congregationId: 1, label: 'Sede Uno' };
export const SEDE_DOS: Scope = { kind: 'CONGREGATION', denominationId: 1, congregationId: 2, label: 'Sede Dos' };
export const SEDE_TRES: Scope = { kind: 'CONGREGATION', denominationId: 1, congregationId: 3, label: 'Sede Tres' };
export const DENOMINATION: Scope = {
  kind: 'DENOMINATION',
  denominationId: 1,
  congregationId: null,
  label: 'Toda la denominación',
};

export const TREASURER_PERMISSIONS: readonly Permission[] = [
  'contributions.read',
  'contributions.write',
  'cash-transactions.write',
  'reports.read',
];
export const SECRETARY_PERMISSIONS: readonly Permission[] = ['members.read', 'members.write', 'attendance.write'];
export const ADMIN_PERMISSIONS: readonly Permission[] = ['congregations.manage', 'users.manage'];

export function treasurer(scope: Scope): RoleAssignment {
  return { role: 'TREASURER', roleName: 'Tesorero(a)', permissions: TREASURER_PERMISSIONS, scope };
}

export function secretary(scope: Scope): RoleAssignment {
  return { role: 'SECRETARY', roleName: 'Secretario(a)', permissions: SECRETARY_PERMISSIONS, scope };
}

export function denominationAdmin(scope: Scope): RoleAssignment {
  return { role: 'DENOMINATION_ADMIN', roleName: 'Administrador de denominación', permissions: ADMIN_PERMISSIONS, scope };
}

export function sessionOf(
  email: string,
  displayName: string,
  assignments: readonly RoleAssignment[],
  selectableScopes: readonly Scope[],
): SessionUser {
  return { id: 1, displayName, email, assignments, selectableScopes };
}
