import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import { Page } from '../../../../shared/utils/pagination';
import { queryParams } from '../../shared/query-params';
import {
  ChildDedication,
  ChildDedicationInput,
  DedicationQuery,
  Marriage,
  MarriageDissolutionInput,
  MarriageInput,
  MarriageQuery,
  PastoralTerm,
  PastoralTermInput,
  PastoralTermQuery,
  PeopleQuery,
  PersonOption,
  RecordsContext,
  RecordsSummary,
} from './records.models';
import { RecordsRepository } from './records.repository';

/** Adapter over `/api/secretariat/*`, `/api/child-dedications`, `/api/marriages` and `/api/pastoral-terms`. */
@Injectable()
export class HttpRecordsRepository extends RecordsRepository {
  private readonly http = inject(HttpClient);

  override context(): Observable<RecordsContext> {
    return this.http.get<RecordsContext>(apiUrl('/secretariat/records/context'));
  }

  override summary(): Observable<RecordsSummary> {
    return this.http.get<RecordsSummary>(apiUrl('/secretariat/records/summary'));
  }

  override searchPeople(query: PeopleQuery): Observable<readonly PersonOption[]> {
    return this.http.get<PersonOption[]>(apiUrl('/secretariat/people'), {
      params: queryParams({
        q: query.q.trim(),
        eligibleFor: query.eligibleFor,
        limit: query.limit,
      }),
    });
  }

  override dedications(query: DedicationQuery): Observable<Page<ChildDedication>> {
    return this.http.get<Page<ChildDedication>>(apiUrl('/child-dedications'), {
      params: queryParams({
        page: query.page,
        pageSize: query.pageSize,
        congregationId: query.congregationId,
        q: query.q?.trim(),
        from: query.from,
        to: query.to,
      }),
    });
  }

  override dedication(id: number): Observable<ChildDedication> {
    return this.http.get<ChildDedication>(apiUrl(`/child-dedications/${id}`));
  }

  override createDedication(input: ChildDedicationInput): Observable<ChildDedication> {
    return this.http.post<ChildDedication>(apiUrl('/child-dedications'), input);
  }

  override marriages(query: MarriageQuery): Observable<Page<Marriage>> {
    return this.http.get<Page<Marriage>>(apiUrl('/marriages'), {
      params: queryParams({
        page: query.page,
        pageSize: query.pageSize,
        status: query.status,
        q: query.q?.trim(),
        from: query.from,
        to: query.to,
      }),
    });
  }

  override createMarriage(input: MarriageInput): Observable<Marriage> {
    return this.http.post<Marriage>(apiUrl('/marriages'), input);
  }

  override dissolveMarriage(id: number, input: MarriageDissolutionInput): Observable<Marriage> {
    return this.http.post<Marriage>(apiUrl(`/marriages/${id}/dissolve`), input);
  }

  override pastoralTerms(query: PastoralTermQuery = {}): Observable<PastoralTerm[]> {
    return this.http.get<PastoralTerm[]>(apiUrl('/pastoral-terms'), {
      params: queryParams({
        congregationId: query.congregationId,
        current: query.current ? true : undefined,
      }),
    });
  }

  override createPastoralTerm(input: PastoralTermInput): Observable<PastoralTerm> {
    return this.http.post<PastoralTerm>(apiUrl('/pastoral-terms'), input);
  }

  override closePastoralTerm(id: number, endedOn: string): Observable<PastoralTerm> {
    return this.http.post<PastoralTerm>(apiUrl(`/pastoral-terms/${id}/close`), { endedOn });
  }
}
