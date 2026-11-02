import { Observable } from 'rxjs';
import {
  ApplicationStatusCheck,
  ApplicationSubmission,
  CurrentPrivacyPolicy,
  OpenCongregation,
  SubmissionReceipt,
} from './public-application.models';

/**
 * PORT of the public membership form. It needs no session: every method is anonymous, so
 * adapters must never depend on AuthService.
 */
export abstract class PublicApplicationRepository {
  /** Active congregations of active denominations that accept applications. */
  abstract listOpenCongregations(): Observable<OpenCongregation[]>;

  /** Privacy policy in force for the denomination. Fails with NOT_FOUND when there is none. */
  abstract getCurrentPolicy(denominationId: number): Observable<CurrentPrivacyPolicy>;

  /** Stores a PENDING application and returns only its tracking code. */
  abstract submit(input: ApplicationSubmission): Observable<SubmissionReceipt>;

  /** Status and dates of an application; NOT_FOUND for an unknown code. */
  abstract checkStatus(trackingCode: string): Observable<ApplicationStatusCheck>;
}
