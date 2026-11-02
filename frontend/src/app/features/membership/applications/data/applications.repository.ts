import { Observable } from 'rxjs';
import {
  ApplicationDetail,
  ApplicationFilter,
  ApplicationQueue,
  ApprovalResult,
} from './applications.models';

/**
 * Port of the application review (C-03/C-04). Every operation applies to the tenant of the
 * session: applications of another sede or denomination do not exist for the caller.
 */
export abstract class ApplicationsRepository {
  /** Applications of the given chip plus the count of every chip. */
  abstract list(filter: ApplicationFilter): Observable<ApplicationQueue>;

  abstract get(id: number): Observable<ApplicationDetail>;

  /** PENDING → IN_REVIEW, assigned to the current reviewer. */
  abstract startReview(id: number): Observable<ApplicationDetail>;

  /** PENDING/IN_REVIEW → REJECTED with a reason the applicant will read. */
  abstract reject(id: number, reason: string): Observable<ApplicationDetail>;

  /** PENDING/IN_REVIEW → DUPLICATE, linked to the existing person with the same document. */
  abstract markDuplicate(id: number, matchedPersonId: number): Observable<ApplicationDetail>;

  /**
   * PENDING/IN_REVIEW → APPROVED: creates person, member, registry entry and consent at once
   * (plus the guardian person of a minor when it is not registered yet). Fails with
   * DUPLICATE_DOCUMENT while a person of the denomination has the same document.
   */
  abstract approve(id: number): Observable<ApprovalResult>;
}
