import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import {
  ApplicationStatusCheck,
  ApplicationSubmission,
  CurrentPrivacyPolicy,
  MunicipalityFilter,
  MunicipalityOption,
  OpenCongregation,
  PublicCatalogs,
  RegionOption,
  SubmissionReceipt,
} from './public-application.models';
import { PublicApplicationRepository } from './public-application.repository';
import { normalizeTrackingCode } from './tracking-code';

interface MunicipalityDto {
  readonly code: string;
  readonly name: string;
  readonly regionCode?: string;
  readonly regionName: string;
}

const DEFAULT_MUNICIPALITY_LIMIT = 12;

/** Public form over the REST API (`/api/public/*`). No session, no tenant header. */
@Injectable()
export class HttpPublicApplicationRepository extends PublicApplicationRepository {
  private readonly http = inject(HttpClient);

  listOpenCongregations(): Observable<OpenCongregation[]> {
    return this.http.get<OpenCongregation[]>(apiUrl('/public/congregations'));
  }

  getCurrentPolicy(denominationId: number): Observable<CurrentPrivacyPolicy> {
    return this.http.get<CurrentPrivacyPolicy>(
      apiUrl(`/public/denominations/${denominationId}/privacy-policy/current`),
    );
  }

  getCatalogs(): Observable<PublicCatalogs> {
    return this.http.get<PublicCatalogs>(apiUrl('/public/catalogs'));
  }

  override listRegions(countryId?: number | null): Observable<RegionOption[]> {
    const params =
      countryId !== undefined && countryId !== null
        ? new HttpParams().set('countryId', countryId)
        : new HttpParams();
    return this.http.get<RegionOption[]>(apiUrl('/public/geo/regions'), { params });
  }

  searchMunicipalities(text: string, filter: MunicipalityFilter = {}): Observable<MunicipalityOption[]> {
    const search = text.trim();
    const regionCode = filter.regionCode?.trim() ?? '';
    let params = new HttpParams();
    if (filter.limit !== undefined) {
      params = params.set('limit', filter.limit);
    } else if (!regionCode || search) {
      params = params.set('limit', DEFAULT_MUNICIPALITY_LIMIT);
    }
    if (search) {
      params = params.set('search', search);
    }
    if (filter.countryId !== undefined && filter.countryId !== null) {
      params = params.set('countryId', filter.countryId);
    }
    if (regionCode) {
      params = params.set('regionCode', regionCode);
    }
    return this.http
      .get<MunicipalityDto[]>(apiUrl('/public/geo/municipalities'), { params })
      .pipe(map((rows) => rows.map(({ code, name, regionName }) => ({ code, name, regionName }))));
  }

  submit(input: ApplicationSubmission): Observable<SubmissionReceipt> {
    return this.http.post<SubmissionReceipt>(apiUrl('/public/membership-applications'), input);
  }

  checkStatus(trackingCode: string): Observable<ApplicationStatusCheck> {
    // The code travels in the body so it never reaches the access logs of the proxy.
    return this.http.post<ApplicationStatusCheck>(apiUrl('/public/membership-applications/status'), {
      trackingCode: normalizeTrackingCode(trackingCode),
    });
  }
}
