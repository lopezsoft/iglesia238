import { Observable } from 'rxjs';
import { TitheOverview, TithePreview, TitheRange, TitheSettlementRow } from './tithe-settlements.models';

/**
 * Port of Liquidación del diezmo (E-05). Every call needs tithe-settlements.write and a sede
 * scope. A settlement copies the rule percentages and amounts; it is never deleted, only voided
 * (which releases its tithes so they can be settled again).
 */
export abstract class TitheSettlementsRepository {
  abstract overview(): Observable<TitheOverview>;
  /** Computes the draft of a range; fails with OVERLAPPING_SETTLEMENT or an invalid range. */
  abstract preview(range: TitheRange): Observable<TithePreview>;
  abstract confirm(range: TitheRange): Observable<TitheSettlementRow>;
  abstract void(settlementId: number, reason: string): Observable<TitheSettlementRow>;
}
