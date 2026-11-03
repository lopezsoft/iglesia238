import type { Transaction } from '../../../../common/persistence/transaction.js';
import type { PolicyStatus } from '../../domain/current-policy.js';

export const PRIVACY_POLICIES_REPOSITORY = Symbol(
  'PRIVACY_POLICIES_REPOSITORY',
);

export interface PolicyRecord {
  id: number;
  denominationId: number;
  version: string;
  content: string;
  /** YYYY-MM-DD */
  effectiveFrom: string;
  status: PolicyStatus;
  publishedAt: Date | null;
  /** Consents granted under this policy. */
  consentCount: number;
  /** Applications that accepted this policy. */
  applicationCount: number;
}

export interface PolicyDraft {
  version: string;
  content: string;
  /** YYYY-MM-DD */
  effectiveFrom: string;
}

/** Persistence of the privacy policies of a denomination. Every method is scoped by denomination. */
export interface PrivacyPoliciesRepository {
  list(denominationId: number): Promise<readonly PolicyRecord[]>;

  find(
    denominationId: number,
    id: number,
    transaction?: Transaction,
  ): Promise<PolicyRecord | null>;

  versionExists(
    denominationId: number,
    version: string,
    exceptId: number | null,
    transaction?: Transaction,
  ): Promise<boolean>;

  /** Latest effective date among the published policies, or null when there is none. */
  latestPublishedEffectiveFrom(
    denominationId: number,
    transaction?: Transaction,
  ): Promise<string | null>;

  create(
    denominationId: number,
    draft: PolicyDraft,
    transaction: Transaction,
  ): Promise<number>;

  /** Only a DRAFT changes; returns false when the policy is no longer a draft. */
  updateDraft(
    denominationId: number,
    id: number,
    draft: PolicyDraft,
    transaction: Transaction,
  ): Promise<boolean>;

  /** Only a DRAFT is deleted; returns false when the policy is no longer a draft. */
  deleteDraft(
    denominationId: number,
    id: number,
    transaction: Transaction,
  ): Promise<boolean>;

  /** DRAFT to PUBLISHED with the final effective date; false when it is no longer a draft. */
  publish(
    denominationId: number,
    id: number,
    effectiveFrom: string,
    publishedAt: Date,
    transaction: Transaction,
  ): Promise<boolean>;
}
