import { Observable } from 'rxjs';
import {
  CashBookOptions,
  CashBookQuery,
  CashBookView,
  CashMovementReceipt,
  CashPeriodOption,
  ConsolidationPreview,
  ConsolidationResult,
  RecordCashTransactionCommand,
  ReverseCashTransactionCommand,
} from './cash-book.models';

/**
 * Port of Libro de caja (E-04): movements per sede, fund and accounting period. Every call
 * needs cash-transactions.write and a sede scope. Lines are never edited nor deleted: they are
 * corrected with a reversal (same account, fund and amount, opposite direction).
 */
export abstract class CashBookRepository {
  abstract options(): Observable<CashBookOptions>;
  abstract view(query: CashBookQuery): Observable<CashBookView>;
  abstract record(command: RecordCashTransactionCommand): Observable<CashMovementReceipt>;
  abstract reverse(command: ReverseCashTransactionCommand): Observable<CashMovementReceipt>;
  /** Closes an OPEN period (previous ones must be closed) and opens the next month if missing. */
  abstract closePeriod(periodId: number): Observable<CashPeriodOption>;
  /** Contributions of a date still pending consolidation, grouped per account and fund. */
  abstract consolidationPreview(date: string): Observable<ConsolidationPreview>;
  /** Posts one inflow per account and fund with a CI voucher and links the contributions. */
  abstract consolidate(date: string): Observable<ConsolidationResult>;
}
