import { Observable } from 'rxjs';
import { PlatformCountryRow } from './platform-countries.models';

/**
 * Port of the countries of the platform (scope P). Deactivating a country hides it from the "País"
 * selects; the API refuses it with 409 `COUNTRY_IN_USE` while active legal entities use it.
 */
export abstract class PlatformCountriesRepository {
  /** Every country, active or not, with its counters. */
  abstract list(): Observable<PlatformCountryRow[]>;
  abstract setActive(id: number, isActive: boolean): Observable<PlatformCountryRow>;
}
