import { Observable } from 'rxjs';
import { Page } from '../../../../shared/utils/pagination';
import { ExportedFile } from '../../data/accounting-http';
import {
  SettlementQuery,
  TitheOverview,
  TithePreview,
  TitheRange,
  TitheSettlementDetail,
  TitheSettlementRow,
} from './tithe-settlements.models';

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
  /** History of the sede, newest first, paginated and filtered by the server. */
  abstract list(query: SettlementQuery): Observable<Page<TitheSettlementRow>>;
  abstract detail(settlementId: number): Observable<TitheSettlementDetail>;
  /** The act of a settlement to sign and file (PDF), with the name the API proposes. A voided one prints too, marked. */
  abstract reportPdf(settlementId: number): Observable<ExportedFile>;
}
