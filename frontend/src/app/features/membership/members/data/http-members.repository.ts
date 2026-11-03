import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import {
  ChurchPosition,
  CongregationOption,
  ConsentView,
  FamilyRelationInput,
  FamilyRelationView,
  MemberCreateInput,
  MemberDetail,
  MemberFilters,
  MemberListPage,
  MemberListQuery,
  MemberPositionsView,
  MemberRegistryView,
  MembershipDataInput,
  PersonOption,
  PersonStudy,
  PersonStudyInput,
  PersonUpdate,
  PositionAssignmentInput,
  SocioeconomicProfile,
  SocioeconomicProfileInput,
  StatusChangeInput,
  TransferInput,
  TransferResult,
} from './members.models';
import { MembersRepository } from './members.repository';

const BASE = '/members';
const SEARCH_LIMIT = 8;

/** Adapter over `/api/members/*`. The API applies the rules, the permissions and the tenant isolation. */
@Injectable()
export class HttpMembersRepository extends MembersRepository {
  private readonly http = inject(HttpClient);

  override list(query: MemberListQuery): Observable<MemberListPage> {
    const params = this.filterParams(query)
      .set('page', query.page)
      .set('pageSize', query.pageSize)
      .set('sortBy', query.sortBy)
      .set('order', query.order);
    return this.http.get<MemberListPage>(apiUrl(BASE), { params });
  }

  override exportCsv(filters: MemberFilters): Observable<Blob> {
    return this.http.get(apiUrl(`${BASE}/export`), {
      params: this.filterParams(filters),
      responseType: 'blob',
    });
  }

  override positionCatalog(): Observable<ChurchPosition[]> {
    return this.http.get<ChurchPosition[]>(apiUrl('/church-positions'));
  }

  override createMember(input: MemberCreateInput): Observable<MemberDetail> {
    return this.http.post<MemberDetail>(apiUrl(BASE), input);
  }

  override searchCandidates(text: string): Observable<PersonOption[]> {
    return this.http.get<PersonOption[]>(apiUrl(`${BASE}/candidates`), {
      params: new HttpParams().set('q', text.trim()).set('limit', SEARCH_LIMIT),
    });
  }

  override searchGuardians(text: string): Observable<PersonOption[]> {
    return this.http.get<PersonOption[]>(apiUrl(`${BASE}/guardians`), {
      params: new HttpParams().set('q', text.trim()).set('limit', SEARCH_LIMIT),
    });
  }

  override detail(memberId: number): Observable<MemberDetail> {
    return this.http.get<MemberDetail>(apiUrl(`${BASE}/${memberId}`));
  }

  override updatePerson(memberId: number, input: PersonUpdate): Observable<MemberDetail> {
    return this.http.patch<MemberDetail>(apiUrl(`${BASE}/${memberId}/person`), input);
  }

  override updateMembership(
    memberId: number,
    input: MembershipDataInput,
  ): Observable<MemberDetail> {
    return this.http.patch<MemberDetail>(apiUrl(`${BASE}/${memberId}/membership`), input);
  }

  override changeStatus(memberId: number, input: StatusChangeInput): Observable<MemberDetail> {
    return this.http.post<MemberDetail>(apiUrl(`${BASE}/${memberId}/status`), input);
  }

  override family(memberId: number): Observable<FamilyRelationView[]> {
    return this.http.get<FamilyRelationView[]>(apiUrl(`${BASE}/${memberId}/family`));
  }

  override searchRelatives(memberId: number, text: string): Observable<PersonOption[]> {
    return this.http.get<PersonOption[]>(apiUrl(`${BASE}/${memberId}/family/candidates`), {
      params: new HttpParams().set('q', text.trim()).set('limit', SEARCH_LIMIT),
    });
  }

  override addFamilyRelation(memberId: number, input: FamilyRelationInput): Observable<void> {
    return this.http.post<void>(apiUrl(`${BASE}/${memberId}/family`), input);
  }

  override removeFamilyRelation(memberId: number, relationId: number): Observable<void> {
    return this.http.delete<void>(apiUrl(`${BASE}/${memberId}/family/${relationId}`));
  }

  override studies(memberId: number): Observable<PersonStudy[]> {
    return this.http.get<PersonStudy[]>(apiUrl(`${BASE}/${memberId}/studies`));
  }

  override addStudy(memberId: number, input: PersonStudyInput): Observable<void> {
    return this.http.post<void>(apiUrl(`${BASE}/${memberId}/studies`), input);
  }

  override removeStudy(memberId: number, studyId: number): Observable<void> {
    return this.http.delete<void>(apiUrl(`${BASE}/${memberId}/studies/${studyId}`));
  }

  override positions(memberId: number): Observable<MemberPositionsView> {
    return this.http.get<MemberPositionsView>(apiUrl(`${BASE}/${memberId}/positions`));
  }

  override assignPosition(memberId: number, input: PositionAssignmentInput): Observable<void> {
    return this.http.post<void>(apiUrl(`${BASE}/${memberId}/positions`), input);
  }

  override closePosition(
    memberId: number,
    memberPositionId: number,
    endedOn: string,
  ): Observable<void> {
    return this.http.post<void>(apiUrl(`${BASE}/${memberId}/positions/${memberPositionId}/close`), {
      endedOn,
    });
  }

  override setPastoralRank(memberId: number, pastoralRankId: number | null): Observable<void> {
    return this.http.put<void>(apiUrl(`${BASE}/${memberId}/pastoral-rank`), { pastoralRankId });
  }

  override socioeconomicProfile(memberId: number): Observable<SocioeconomicProfile | null> {
    return this.http.get<SocioeconomicProfile | null>(
      apiUrl(`${BASE}/${memberId}/socioeconomic-profile`),
    );
  }

  override saveSocioeconomicProfile(
    memberId: number,
    input: SocioeconomicProfileInput,
  ): Observable<SocioeconomicProfile> {
    return this.http.put<SocioeconomicProfile>(
      apiUrl(`${BASE}/${memberId}/socioeconomic-profile`),
      input,
    );
  }

  override registry(memberId: number): Observable<MemberRegistryView> {
    return this.http.get<MemberRegistryView>(apiUrl(`${BASE}/${memberId}/registry`));
  }

  override transferDestinations(memberId: number): Observable<CongregationOption[]> {
    return this.http.get<CongregationOption[]>(apiUrl(`${BASE}/${memberId}/transfer-destinations`));
  }

  override transfer(memberId: number, input: TransferInput): Observable<TransferResult> {
    return this.http.post<TransferResult>(apiUrl(`${BASE}/${memberId}/transfers`), input);
  }

  override consents(memberId: number): Observable<ConsentView[]> {
    return this.http.get<ConsentView[]>(apiUrl(`${BASE}/${memberId}/consents`));
  }

  override revokeConsent(memberId: number, consentId: number): Observable<void> {
    return this.http.post<void>(apiUrl(`${BASE}/${memberId}/consents/${consentId}/revoke`), {});
  }

  override anonymize(memberId: number): Observable<void> {
    return this.http.post<void>(apiUrl(`${BASE}/${memberId}/anonymize`), {});
  }

  /** Only the filters that narrow the list are sent: the API treats the rest as "all". */
  private filterParams(filters: MemberFilters): HttpParams {
    let params = new HttpParams();
    const text = filters.text.trim();
    if (text !== '') {
      params = params.set('text', text);
    }
    if (filters.status !== 'ALL') {
      params = params.set('status', filters.status);
    }
    if (filters.sex !== 'ALL') {
      params = params.set('sex', filters.sex);
    }
    if (filters.ageRange !== 'ALL') {
      params = params.set('ageRange', filters.ageRange);
    }
    if (filters.position !== 'ALL') {
      params = params.set('position', String(filters.position));
    }
    if (filters.congregationId !== null) {
      params = params.set('congregationId', filters.congregationId);
    }
    return params;
  }
}
