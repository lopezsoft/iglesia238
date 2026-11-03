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
 * Creating a denomination also creates its template on the server in one transaction: the
 * "Fondo Local" fund, a starting chart of accounts, the contribution and certificate types, the
 * pastoral ranks and positions, and the first privacy policy as a draft. Tithe percentages are not
 * part of it: the denomination admin enters them in the accounting setup.
 */
export abstract class DenominationsRepository {
  abstract list(query: DenominationQuery): Observable<Page<DenominationSummary>>;
  abstract stats(): Observable<DenominationStats>;
  abstract create(input: DenominationInput): Observable<DenominationSummary>;
  abstract rename(id: number, input: DenominationInput): Observable<DenominationSummary>;
  abstract setActive(id: number, isActive: boolean): Observable<DenominationSummary>;
}
