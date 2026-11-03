import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import { PersonOption } from '../../data/accounting.models';
import { ExportedFile, toExportedFile, toParams } from '../../data/accounting-http';
import {
  ContributionDetail,
  ContributionFilters,
  ContributionFormOptions,
  ContributionListing,
  ContributionQuery,
  ContributionRow,
  RecordContributionCommand,
  VowPaymentTarget,
  VowPledgeOption,
} from './contributions.models';
import { ContributionsRepository } from './contributions.repository';

function filterParams(filters: ContributionFilters) {
  return {
    year: filters.year,
    month: filters.month,
    from: filters.from,
    to: filters.to,
    category: filters.category,
    contributionTypeId: filters.contributionTypeId,
    paymentMethod: filters.paymentMethod,
    status: filters.status,
    search: filters.search?.trim(),
  };
}

/** Adapter of Aportes over `/api/accounting/contributions` and `/api/accounting/contributors`. */
@Injectable()
export class HttpContributionsRepository extends ContributionsRepository {
  private readonly http = inject(HttpClient);

  override formOptions(): Observable<ContributionFormOptions> {
    return this.http.get<ContributionFormOptions>(apiUrl('/accounting/contributions/form-options'));
  }

  override list(query: ContributionQuery): Observable<ContributionListing> {
    return this.http.get<ContributionListing>(apiUrl('/accounting/contributions'), {
      params: toParams({ ...filterParams(query), page: query.page, pageSize: query.pageSize }),
    });
  }

  override detail(contributionId: number): Observable<ContributionDetail> {
    return this.http.get<ContributionDetail>(apiUrl(`/accounting/contributions/${contributionId}`));
  }

  override searchPersons(query: string): Observable<PersonOption[]> {
    return this.http.get<PersonOption[]>(apiUrl('/accounting/contributors/search'), {
      params: toParams({ q: query.trim() }),
    });
  }

  override openPledges(personId: number, contributionTypeId: number): Observable<VowPledgeOption[]> {
    return this.http.get<VowPledgeOption[]>(apiUrl('/accounting/vow-pledges/open'), {
      params: toParams({ personId, contributionTypeId }),
    });
  }

  override vowPaymentTarget(pledgeId: number): Observable<VowPaymentTarget> {
    return this.http.get<VowPaymentTarget>(apiUrl(`/accounting/vow-pledges/${pledgeId}/payment-target`));
  }

  override record(command: RecordContributionCommand): Observable<ContributionRow> {
    return this.http.post<ContributionRow>(apiUrl('/accounting/contributions'), command);
  }

  override void(contributionId: number, reason: string): Observable<ContributionRow> {
    return this.http.post<ContributionRow>(apiUrl(`/accounting/contributions/${contributionId}/void`), {
      reason,
    });
  }

  override receiptPdf(voucherId: number): Observable<Blob> {
    return this.http.get(apiUrl(`/accounting/vouchers/${voucherId}/pdf`), {
      responseType: 'blob',
      headers: { Accept: 'application/pdf' },
    });
  }

  override exportCsv(filters: ContributionFilters): Observable<ExportedFile> {
    return this.http
      .get(apiUrl('/accounting/contributions/export'), {
        params: toParams(filterParams(filters)),
        observe: 'response',
        responseType: 'blob',
      })
      .pipe(map((response) => toExportedFile(response, 'aportes.csv')));
  }
}
