import { Observable } from 'rxjs';
import {
  ApplicationDetail,
  ApplicationListQuery,
  ApplicationQueue,
  ApprovalResult,
} from './applications.models';

export interface ApproveOptions {
  /** Person already registered with the same document: the application is approved on top of it. */
  readonly linkToPersonId?: number;
}

/**
 * Port of the application review (C-03/C-04). Every operation applies to the tenant of the
 * session: applications of another sede or denomination do not exist for the caller.
 */
export abstract class ApplicationsRepository {
  /** One page of the queue plus the count of every chip. */
  abstract list(query: ApplicationListQuery): Observable<ApplicationQueue>;

  abstract get(id: number): Observable<ApplicationDetail>;

  /** PENDING → IN_REVIEW, assigned to the current reviewer. */
  abstract startReview(id: number): Observable<ApplicationDetail>;

  /** PENDING/IN_REVIEW → REJECTED. The reason is internal: the applicant only sees a generic notice. */
  abstract reject(id: number, reason: string): Observable<ApplicationDetail>;

  /** PENDING/IN_REVIEW → DUPLICATE, linked to the existing person with the same document. */
  abstract markDuplicate(id: number, matchedPersonId: number): Observable<ApplicationDetail>;

  /**
   * PENDING/IN_REVIEW → APPROVED: creates person, member, registry entry and consent at once
   * (plus the guardian of a minor). Fails with DUPLICATE_DOCUMENT while a person of the
   * denomination has the same document and `linkToPersonId` is not given.
   */
  abstract approve(id: number, options?: ApproveOptions): Observable<ApprovalResult>;
}
