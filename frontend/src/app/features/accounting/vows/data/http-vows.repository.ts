import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import { PersonOption } from '../../data/accounting.models';
import { ExportedFile, toExportedFile, toParams } from '../../data/accounting-http';
import {
  CreateVowPledgeCommand,
  UpdateVowPledgeCommand,
  VowFilters,
  VowPledgeDetail,
  VowPledgeRow,
  VowsOverview,
  VowsQuery,
} from './vows.models';
import { VowsRepository } from './vows.repository';

function filterParams(filters: VowFilters) {
  return {
    status: filters.status,
    contributionTypeId: filters.contributionTypeId,
    search: filters.search?.trim(),
    // The API reads the flag only when it is true.
    overdueOnly: filters.overdueOnly ? true : undefined,
  };
}

/** Adapter of Votos over `/api/accounting/vow-pledges`. */
@Injectable()
export class HttpVowsRepository extends VowsRepository {
  private readonly http = inject(HttpClient);

  override overview(query: VowsQuery): Observable<VowsOverview> {
    return this.http.get<VowsOverview>(apiUrl('/accounting/vow-pledges'), {
      params: toParams({ ...filterParams(query), page: query.page, pageSize: query.pageSize }),
    });
  }

  override detail(pledgeId: number): Observable<VowPledgeDetail> {
    return this.http.get<VowPledgeDetail>(apiUrl(`/accounting/vow-pledges/${pledgeId}`));
  }

  override create(command: CreateVowPledgeCommand): Observable<VowPledgeRow> {
    return this.http.post<VowPledgeRow>(apiUrl('/accounting/vow-pledges'), command);
  }

  override update(pledgeId: number, command: UpdateVowPledgeCommand): Observable<VowPledgeRow> {
    return this.http.patch<VowPledgeRow>(apiUrl(`/accounting/vow-pledges/${pledgeId}`), command);
  }

  override cancel(pledgeId: number, reason: string): Observable<VowPledgeRow> {
    return this.http.post<VowPledgeRow>(apiUrl(`/accounting/vow-pledges/${pledgeId}/cancel`), { reason });
  }

  override searchPersons(query: string): Observable<PersonOption[]> {
    return this.http.get<PersonOption[]>(apiUrl('/accounting/contributors/search'), {
      params: toParams({ q: query.trim() }),
    });
  }

  override exportCsv(filters: VowFilters): Observable<ExportedFile> {
    return this.http
      .get(apiUrl('/accounting/vow-pledges/export'), {
        params: toParams(filterParams(filters)),
        observe: 'response',
        responseType: 'blob',
      })
      .pipe(map((response) => toExportedFile(response, 'votos.csv')));
  }
}
