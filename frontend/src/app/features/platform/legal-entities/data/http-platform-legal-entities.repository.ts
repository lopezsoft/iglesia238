import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import {
  PlatformLegalEntityCreate,
  PlatformLegalEntityInput,
  PlatformLegalEntityRow,
} from './platform-legal-entities.models';
import { PlatformLegalEntitiesRepository } from './platform-legal-entities.repository';

const BASE = '/platform/legal-entities';

/** Adapter over `/api/platform/legal-entities`. The scope interceptor sends `X-Scope: P`. */
@Injectable()
export class HttpPlatformLegalEntitiesRepository extends PlatformLegalEntitiesRepository {
  private readonly http = inject(HttpClient);

  override list(denominationId: number | null): Observable<PlatformLegalEntityRow[]> {
    const params = denominationId === null ? new HttpParams() : new HttpParams().set('denominationId', denominationId);
    return this.http.get<PlatformLegalEntityRow[]>(apiUrl(BASE), { params });
  }

  override create(input: PlatformLegalEntityCreate): Observable<PlatformLegalEntityRow> {
    return this.http.post<PlatformLegalEntityRow>(apiUrl(BASE), input);
  }

  override update(id: number, input: PlatformLegalEntityInput): Observable<PlatformLegalEntityRow> {
    return this.http.patch<PlatformLegalEntityRow>(apiUrl(`${BASE}/${id}`), input);
  }

  override setActive(id: number, isActive: boolean): Observable<PlatformLegalEntityRow> {
    return this.http.patch<PlatformLegalEntityRow>(apiUrl(`${BASE}/${id}/status`), { isActive });
  }
}
