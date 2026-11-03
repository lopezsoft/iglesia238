import { Observable } from 'rxjs';
import { CongregationRegistration, PublicLegalEntity, RegistrationReceipt } from './congregation-registration.models';

/**
 * PORT of the public congregation registration. It needs no session: every method is anonymous, so
 * adapters must never depend on AuthService.
 */
export abstract class CongregationRegistrationRepository {
  /** Active legal entities of active churches, with the NIT masked and their country. */
  abstract listLegalEntities(): Observable<PublicLegalEntity[]>;

  /**
   * Creates the congregation (active at once) and its manager's user. Fails with 409 when the manager's
   * e-mail is already registered, with 400 when the password breaks the policy and with 400
   * `MUNICIPALITY_COUNTRY_MISMATCH` when the municipality is not of the country of the legal entity.
   */
  abstract register(input: CongregationRegistration): Observable<RegistrationReceipt>;
}
