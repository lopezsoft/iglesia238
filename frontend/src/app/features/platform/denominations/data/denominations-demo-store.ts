import { Injectable } from '@angular/core';

/** Privacy policy text a denomination is still writing: it is not in force until published. */
export interface PrivacyPolicyDraft {
  readonly denominationId: number;
  readonly version: string;
  readonly content: string;
  readonly createdAt: string;
}

/**
 * Demo-only tables of the platform slice. Drafts live here, not in `DemoDatabase.privacyPolicies`,
 * because the shared PrivacyPolicy model has no status: every row there counts as published, and
 * the public form would ask applicants to accept a draft. Only demo adapters may inject it.
 */
@Injectable({ providedIn: 'root' })
export class DenominationsDemoStore {
  readonly privacyPolicyDrafts: PrivacyPolicyDraft[] = [];
}
