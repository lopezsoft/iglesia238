import type { ScopeKind } from '../../../common/tenancy/scope-key.js';

export interface ScopeView {
  readonly kind: ScopeKind;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  readonly label: string;
}

export interface AssignmentView {
  readonly role: string;
  readonly roleName: string;
  readonly permissions: readonly string[];
  readonly scope: ScopeView;
}

/** What the frontend needs to start a session: who, with which roles and where they can act. */
export interface SessionView {
  readonly id: number;
  readonly displayName: string;
  readonly email: string;
  /** False until the person confirms the mailbox: every domain route answers 403 EMAIL_NOT_VERIFIED. */
  readonly emailVerified: boolean;
  readonly assignments: readonly AssignmentView[];
  readonly selectableScopes: readonly ScopeView[];
}

export const PLATFORM_SCOPE_LABEL = 'Plataforma';

export function denominationScopeLabel(denominationName: string): string {
  return `Toda la denominación · ${denominationName}`;
}

export function scopeKeyOf(scope: ScopeView): string {
  switch (scope.kind) {
    case 'PLATFORM':
      return 'P';
    case 'DENOMINATION':
      return `D:${scope.denominationId}`;
    case 'CONGREGATION':
      return `C:${scope.congregationId}`;
  }
}

/** A user always has a name to show: the part of the e-mail before the @ when none was given. */
export function displayNameOf(
  displayName: string | null,
  email: string,
): string {
  const name = displayName?.trim();
  return name ? name : email.split('@')[0];
}
