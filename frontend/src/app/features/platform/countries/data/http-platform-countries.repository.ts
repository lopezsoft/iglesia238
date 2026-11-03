import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import { PlatformCountryRow } from './platform-countries.models';
import { PlatformCountriesRepository } from './platform-countries.repository';

const BASE = '/platform/countries';

/** Adapter over `/api/platform/countries`. The scope interceptor sends `X-Scope: P`. */
@Injectable()
export class HttpPlatformCountriesRepository extends PlatformCountriesRepository {
  private readonly http = inject(HttpClient);

  override list(): Observable<PlatformCountryRow[]> {
    return this.http.get<PlatformCountryRow[]>(apiUrl(BASE));
  }

  override setActive(id: number, isActive: boolean): Observable<PlatformCountryRow> {
    return this.http.patch<PlatformCountryRow>(apiUrl(`${BASE}/${id}/status`), { isActive });
  }
}
