import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import {
  CongregationFormOptions,
  CongregationInput,
  CongregationRow,
  DistrictInput,
  DistrictRow,
  LegalEntityInput,
  LegalEntityRow,
  OrganizationOverview,
  SelectOption,
} from './organization.models';
import { OrganizationRepository } from './organization.repository';

const BASE = '/organization';

/** GET /organization/congregations/form-options. The legal entities may or may not carry their country. */
interface FormOptionsDto {
  readonly legalEntities: readonly (SelectOption & { countryId?: number | null; countryName?: string | null })[];
  readonly districts: readonly SelectOption[];
}

/** Adapter over `/api/organization/*`. The API applies the rules and isolates the denomination. */
@Injectable()
export class HttpOrganizationRepository extends OrganizationRepository {
  private readonly http = inject(HttpClient);

  override overview(): Observable<OrganizationOverview> {
    return this.http.get<OrganizationOverview>(apiUrl(`${BASE}/overview`));
  }

  override hasPolicyInForce(): Observable<boolean> {
    return this.http
      .get<{ hasCurrentPolicy: boolean }>(apiUrl('/privacy-policies'))
      .pipe(map((list) => list.hasCurrentPolicy));
  }

  override listCongregations(): Observable<CongregationRow[]> {
    return this.http.get<CongregationRow[]>(apiUrl(`${BASE}/congregations`));
  }

  /**
   * Options of the sede form. The legal entities are completed with their country (from the legal entity
   * rows) because the municipality of a sede must belong to the country of its legal entity.
   */
  override congregationFormOptions(): Observable<CongregationFormOptions> {
    return forkJoin({
      options: this.http.get<FormOptionsDto>(apiUrl(`${BASE}/congregations/form-options`)),
      rows: this.listLegalEntities(),
    }).pipe(
      map(({ options, rows }) => {
        const byId = new Map(rows.map((row) => [row.id, row]));
        return {
          districts: options.districts,
          legalEntities: options.legalEntities.map(({ id, label, isActive, countryId, countryName }) => {
            const row = byId.get(id);
            return {
              id,
              label,
              isActive,
              countryId: countryId ?? row?.countryId ?? null,
              countryName: countryName ?? row?.countryName ?? null,
            };
          }),
        };
      }),
    );
  }

  override createCongregation(input: CongregationInput): Observable<CongregationRow> {
    return this.http.post<CongregationRow>(apiUrl(`${BASE}/congregations`), input);
  }

  override updateCongregation(id: number, input: CongregationInput): Observable<CongregationRow> {
    return this.http.put<CongregationRow>(apiUrl(`${BASE}/congregations/${id}`), input);
  }

  override setCongregationActive(id: number, isActive: boolean): Observable<CongregationRow> {
    return this.http.patch<CongregationRow>(apiUrl(`${BASE}/congregations/${id}/status`), { isActive });
  }

  override setAcceptsApplications(
    id: number,
    acceptsApplications: boolean,
  ): Observable<CongregationRow> {
    return this.http.patch<CongregationRow>(
      apiUrl(`${BASE}/congregations/${id}/accepts-applications`),
      { acceptsApplications },
    );
  }

  override listLegalEntities(): Observable<LegalEntityRow[]> {
    return this.http.get<LegalEntityRow[]>(apiUrl(`${BASE}/legal-entities`));
  }

  override createLegalEntity(input: LegalEntityInput): Observable<LegalEntityRow> {
    return this.http.post<LegalEntityRow>(apiUrl(`${BASE}/legal-entities`), input);
  }

  override updateLegalEntity(id: number, input: LegalEntityInput): Observable<LegalEntityRow> {
    return this.http.put<LegalEntityRow>(apiUrl(`${BASE}/legal-entities/${id}`), input);
  }

  override setLegalEntityActive(id: number, isActive: boolean): Observable<LegalEntityRow> {
    return this.http.patch<LegalEntityRow>(apiUrl(`${BASE}/legal-entities/${id}/status`), { isActive });
  }

  override listDistricts(): Observable<DistrictRow[]> {
    return this.http.get<DistrictRow[]>(apiUrl(`${BASE}/districts`));
  }

  override createDistrict(input: DistrictInput): Observable<DistrictRow> {
    return this.http.post<DistrictRow>(apiUrl(`${BASE}/districts`), input);
  }

  override updateDistrict(id: number, input: DistrictInput): Observable<DistrictRow> {
    return this.http.put<DistrictRow>(apiUrl(`${BASE}/districts/${id}`), input);
  }
}
