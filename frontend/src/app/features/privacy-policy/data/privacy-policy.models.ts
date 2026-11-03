// Versions of the data-processing policy (Ley 1581 de 2012) of a denomination, mirroring
// /api/privacy-policies. Applicants accept the CURRENT one in the public form.
import { BadgeTone } from '../../../shared/ui/status-badge.component';
import { bogotaTodayIso } from '../../../core/time/bogota-date';

/**
 * - DRAFT: not visible to the public; can be edited, published or deleted.
 * - CURRENT: the policy applicants accept today.
 * - SCHEDULED: published, its effective date has not arrived.
 * - SUPERSEDED: published and replaced by a newer one.
 */
export type PolicyState = 'DRAFT' | 'CURRENT' | 'SCHEDULED' | 'SUPERSEDED';

export interface PrivacyPolicy {
  readonly id: number;
  readonly version: string;
  readonly content: string;
  /** yyyy-MM-dd */
  readonly effectiveFrom: string;
  readonly status: 'DRAFT' | 'PUBLISHED';
  readonly state: PolicyState;
  readonly isCurrent: boolean;
  /** ISO date-time, null for a draft. */
  readonly publishedAt: string | null;
  /** Authorizations granted under this policy. */
  readonly consentCount: number;
  /** Applications that accepted this policy. */
  readonly applicationCount: number;
}

export interface PrivacyPolicyList {
  readonly items: readonly PrivacyPolicy[];
  /** False: no published policy is in force, so the public form is closed for the denomination. */
  readonly hasCurrentPolicy: boolean;
}

/** What the administrator writes. */
export interface PrivacyPolicyDraft {
  readonly version: string;
  readonly content: string;
  /** yyyy-MM-dd */
  readonly effectiveFrom: string;
}

export const POLICY_VERSION_MAX_LENGTH = 20;
export const POLICY_CONTENT_MIN_LENGTH = 50;
export const POLICY_CONTENT_MAX_LENGTH = 30000;

export const POLICY_STATE_LABELS: Readonly<Record<PolicyState, string>> = {
  DRAFT: 'Borrador',
  CURRENT: 'Vigente',
  SCHEDULED: 'Programada',
  SUPERSEDED: 'Reemplazada',
};

export const POLICY_STATE_TONES: Readonly<Record<PolicyState, BadgeTone>> = {
  DRAFT: 'neutral',
  CURRENT: 'success',
  SCHEDULED: 'info',
  SUPERSEDED: 'warning',
};

/** Calendar date (yyyy-MM-dd) in Bogota, the format of the API date fields. */
export function todayIso(now: Date = new Date()): string {
  return bogotaTodayIso(now);
}

/** Suggests the next version: "1.0" -> "1.1", "2" -> "3". Falls back to "1.0". */
export function suggestNextVersion(versions: readonly string[]): string {
  const latest = versions
    .map((version) => /^(\d+)(?:\.(\d+))?$/.exec(version.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => [Number(match[1]), match[2] === undefined ? null : Number(match[2])] as const)
    .sort((a, b) => b[0] - a[0] || (b[1] ?? -1) - (a[1] ?? -1))[0];
  if (!latest) {
    return '1.0';
  }
  return latest[1] === null ? String(latest[0] + 1) : `${latest[0]}.${latest[1] + 1}`;
}
