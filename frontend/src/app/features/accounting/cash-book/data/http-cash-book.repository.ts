import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import { Page } from '../../../../shared/utils/pagination';
import { ExportedFile, toExportedFile, toParams } from '../../data/accounting-http';
import {
  CashBookOptions,
  CashBookReportFormat,
  CashBookQuery,
  CashBookView,
  CashMovementReceipt,
  CashPeriodOption,
  ConsolidationPreview,
  ConsolidationResult,
  RecordCashTransactionCommand,
  ReverseCashTransactionCommand,
  VoucherDetail,
  VoucherListItem,
  VoucherQuery,
} from './cash-book.models';
import { CashBookRepository } from './cash-book.repository';

/** Adapter of Libro de caja over `/api/accounting/cash-book`, `/periods` and `/vouchers`. */
@Injectable()
export class HttpCashBookRepository extends CashBookRepository {
  private readonly http = inject(HttpClient);

  override options(): Observable<CashBookOptions> {
    return this.http.get<CashBookOptions>(apiUrl('/accounting/cash-book/options'));
  }

  override view(query: CashBookQuery): Observable<CashBookView> {
    return this.http.get<CashBookView>(apiUrl('/accounting/cash-book'), {
      params: toParams({
        fundId: query.fundId,
        periodId: query.periodId,
        page: query.page,
        pageSize: query.pageSize,
        direction: query.direction,
        accountId: query.accountId,
        search: query.search?.trim(),
      }),
    });
  }

  override record(command: RecordCashTransactionCommand): Observable<CashMovementReceipt> {
    return this.http.post<CashMovementReceipt>(apiUrl('/accounting/cash-book/transactions'), command);
  }

  override reverse(command: ReverseCashTransactionCommand): Observable<CashMovementReceipt> {
    const { transactionId, postedOn, reason } = command;
    return this.http.post<CashMovementReceipt>(apiUrl(`/accounting/cash-book/transactions/${transactionId}/reverse`), {
      postedOn,
      reason,
    });
  }

  override closePeriod(periodId: number): Observable<CashPeriodOption> {
    return this.http.post<CashPeriodOption>(apiUrl(`/accounting/periods/${periodId}/close`), {});
  }

  override consolidationPreview(date: string): Observable<ConsolidationPreview> {
    return this.http.get<ConsolidationPreview>(apiUrl('/accounting/cash-book/consolidation-preview'), {
      params: toParams({ date }),
    });
  }

  override consolidate(date: string): Observable<ConsolidationResult> {
    return this.http.post<ConsolidationResult>(apiUrl('/accounting/cash-book/consolidations'), { date });
  }

  override vouchers(query: VoucherQuery): Observable<Page<VoucherListItem>> {
    return this.http.get<Page<VoucherListItem>>(apiUrl('/accounting/vouchers'), {
      params: toParams({
        page: query.page,
        pageSize: query.pageSize,
        type: query.type,
        from: query.from,
        to: query.to,
        status: query.status,
        number: query.number,
      }),
    });
  }

  override voucher(id: number): Observable<VoucherDetail> {
    return this.http.get<VoucherDetail>(apiUrl(`/accounting/vouchers/${id}`));
  }

  override voucherPdf(id: number): Observable<Blob> {
    return this.http.get(apiUrl(`/accounting/vouchers/${id}/pdf`), {
      responseType: 'blob',
      headers: { Accept: 'application/pdf' },
    });
  }

  override report(format: CashBookReportFormat, fundId: number, periodId: number): Observable<ExportedFile> {
    return this.http
      .get(apiUrl(`/accounting/cash-book/report.${format}`), {
        params: toParams({ fundId, periodId }),
        headers: { Accept: format === 'pdf' ? 'application/pdf' : 'text/csv' },
        observe: 'response',
        responseType: 'blob',
      })
      .pipe(map((response) => toExportedFile(response, `libro-de-caja.${format}`)));
  }
}
