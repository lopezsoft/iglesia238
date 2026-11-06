import { Observable, of } from 'rxjs';
import {
  ApplicationStatusCheck,
  ApplicationSubmission,
  CurrentPrivacyPolicy,
  MunicipalityFilter,
  MunicipalityOption,
  OpenCongregation,
  PublicCatalogs,
  RegionOption,
  SubmissionReceipt,
} from './public-application.models';

/**
 * PORT of the public membership form. It needs no session: every method is anonymous, so
 * adapters must never depend on AuthService.
 */
export abstract class PublicApplicationRepository {
  /** Active congregations of active denominations that accept applications. */
  abstract listOpenCongregations(): Observable<OpenCongregation[]>;

  /** Privacy policy in force for the denomination. Fails with POLICY_NOT_AVAILABLE when there is none. */
  abstract getCurrentPolicy(denominationId: number): Observable<CurrentPrivacyPolicy>;

  /** Document types and marital statuses of the form. */
  abstract getCatalogs(): Observable<PublicCatalogs>;

  /** Departments, states or provinces of an active country (`GET /public/geo/regions`). */
  listRegions(_countryId: number): Observable<RegionOption[]> {
    return of([]);
  }

  /**
   * Municipalities whose name matches the text (any of them when it is empty), optionally of one
   * country and/or region only; at most `filter.limit`.
   */
  abstract searchMunicipalities(text: string, filter?: MunicipalityFilter): Observable<MunicipalityOption[]>;

  /** Stores a PENDING application and returns only its tracking code. */
  abstract submit(input: ApplicationSubmission): Observable<SubmissionReceipt>;

  /** Status and dates of an application; NOT_FOUND for an unknown code. */
  abstract checkStatus(trackingCode: string): Observable<ApplicationStatusCheck>;
}
