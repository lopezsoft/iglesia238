import { Observable } from 'rxjs';
import { Page } from '../../../../shared/utils/pagination';
import {
  DenominationInput,
  DenominationQuery,
  DenominationStats,
  DenominationSummary,
} from './denominations.models';

/**
 * Port of the denominations module (B-01). Every operation requires `denominations.manage`.
 * Creating a denomination also creates its defaults on the server: the "Fondo Local" fund,
 * the default contribution types and the first privacy policy draft (not in force until the
 * denomination admin publishes it).
 *
 * The demo adapter only creates the policy draft: the accounting tables belong to the
 * accounting slice, which exposes no port to seed a new denomination yet.
 */
export abstract class DenominationsRepository {
  abstract list(query: DenominationQuery): Observable<Page<DenominationSummary>>;
  abstract stats(): Observable<DenominationStats>;
  abstract create(input: DenominationInput): Observable<DenominationSummary>;
  abstract rename(id: number, input: DenominationInput): Observable<DenominationSummary>;
  abstract setActive(id: number, isActive: boolean): Observable<DenominationSummary>;
}
