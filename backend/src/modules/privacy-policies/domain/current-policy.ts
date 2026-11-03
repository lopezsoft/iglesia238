export type PolicyStatus = 'DRAFT' | 'PUBLISHED';

/**
 * What the screen shows for a policy:
 * - DRAFT: not visible to the public, can be edited and deleted.
 * - CURRENT: the one applicants accept today.
 * - SCHEDULED: published, but its effective date has not arrived.
 * - SUPERSEDED: published and replaced by a newer one.
 */
export type PolicyState = 'DRAFT' | 'CURRENT' | 'SCHEDULED' | 'SUPERSEDED';

export interface PolicyDates {
  id: number;
  status: PolicyStatus;
  /** YYYY-MM-DD */
  effectiveFrom: string;
}

/**
 * The policy in force on `today`: the published one with the latest effective date that has already
 * arrived (ties go to the one created last). null when none applies, and the public form is closed.
 * The public query applies the same rule in SQL.
 */
export function currentPolicyId(
  policies: readonly PolicyDates[],
  today: string,
): number | null {
  const candidates = policies
    .filter(
      (policy) =>
        policy.status === 'PUBLISHED' && policy.effectiveFrom <= today,
    )
    .sort(
      (a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.id - a.id,
    );
  return candidates[0]?.id ?? null;
}

export function policyState(
  policy: PolicyDates,
  currentId: number | null,
  today: string,
): PolicyState {
  if (policy.status === 'DRAFT') {
    return 'DRAFT';
  }
  if (policy.id === currentId) {
    return 'CURRENT';
  }
  return policy.effectiveFrom > today ? 'SCHEDULED' : 'SUPERSEDED';
}

export const POLICY_VERSION_MAX_LENGTH = 20;
export const POLICY_CONTENT_MIN_LENGTH = 50;
export const POLICY_CONTENT_MAX_LENGTH = 30000;
