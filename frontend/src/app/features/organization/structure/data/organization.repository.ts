import { Observable } from 'rxjs';
import {
  CongregationFormOptions,
  CongregationInput,
  CongregationRow,
  DistrictInput,
  DistrictRow,
  LegalEntityInput,
  LegalEntityRow,
  OrganizationOverview,
} from './organization.models';

/**
 * Port of the organization module (B-02/B-03). It always works on the denomination of the
 * active tenant and requires `congregations.manage`; ids of another denomination are rejected.
 */
export abstract class OrganizationRepository {
  abstract overview(): Observable<OrganizationOverview>;

  abstract listCongregations(): Observable<CongregationRow[]>;
  abstract congregationFormOptions(): Observable<CongregationFormOptions>;
  abstract createCongregation(input: CongregationInput): Observable<CongregationRow>;
  abstract updateCongregation(id: number, input: CongregationInput): Observable<CongregationRow>;
  abstract setCongregationActive(id: number, isActive: boolean): Observable<CongregationRow>;
  abstract setAcceptsApplications(
    id: number,
    acceptsApplications: boolean,
  ): Observable<CongregationRow>;

  abstract listLegalEntities(): Observable<LegalEntityRow[]>;
  abstract createLegalEntity(input: LegalEntityInput): Observable<LegalEntityRow>;
  abstract updateLegalEntity(id: number, input: LegalEntityInput): Observable<LegalEntityRow>;
  abstract setLegalEntityActive(id: number, isActive: boolean): Observable<LegalEntityRow>;

  abstract listDistricts(): Observable<DistrictRow[]>;
  abstract createDistrict(input: DistrictInput): Observable<DistrictRow>;
  abstract updateDistrict(id: number, input: DistrictInput): Observable<DistrictRow>;
}
