import { Observable } from 'rxjs';
import { PrivacyPolicy, PrivacyPolicyDraft, PrivacyPolicyList } from './privacy-policy.models';

/** Port of the policy administration of the denomination of the session. */
export abstract class PrivacyPolicyRepository {
  abstract list(): Observable<PrivacyPolicyList>;

  /** New draft. Fails with POLICY_VERSION_EXISTS when the version is taken. */
  abstract create(draft: PrivacyPolicyDraft): Observable<PrivacyPolicy>;

  /** Edits a draft. A published policy fails with POLICY_NOT_EDITABLE. */
  abstract update(id: number, draft: PrivacyPolicyDraft): Observable<PrivacyPolicy>;

  /** Deletes a draft. */
  abstract remove(id: number): Observable<void>;

  /**
   * Publishes a draft: applicants accept it from then on. A date already past becomes today.
   * Fails with POLICY_EFFECTIVE_DATE_OUTDATED when another published policy takes effect later.
   */
  abstract publish(id: number): Observable<PrivacyPolicy>;
}
