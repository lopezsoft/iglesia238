import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import {
  CardCandidatePage,
  CardCandidateQuery,
  CardFilter,
  CardListItem,
  CardPage,
  CertificateDetail,
  CertificateExportFilter,
  CertificateFilter,
  CertificateListItem,
  CertificatePage,
  CertificatePreview,
  CertificateTypeSummary,
  CertificatesSummary,
  IssueCardCommand,
  IssueCertificateCommand,
  IssuingContext,
  MemberOption,
  VoidCommand,
} from './certificates.models';
import { CertificatesRepository } from './certificates.repository';

type QueryValue = string | number | null | undefined;

/** Query string without the empty filters: the API validates what it receives. */
function queryOf(values: Readonly<Record<string, QueryValue>>): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}

function certificateQuery(filter: CertificateExportFilter): Record<string, QueryValue> {
  return {
    typeCode: filter.typeCode,
    status: filter.status,
    q: filter.q?.trim(),
    issuedFrom: filter.issuedFrom,
    issuedTo: filter.issuedTo,
    sort: filter.sort,
  };
}

/** Adapter over `/api/certificates`, `/api/certificate-types` and `/api/membership-cards`. */
@Injectable()
export class HttpCertificatesRepository extends CertificatesRepository {
  private readonly http = inject(HttpClient);

  override types(): Observable<readonly CertificateTypeSummary[]> {
    return this.http.get<CertificateTypeSummary[]>(apiUrl('/certificate-types'));
  }

  override issuingContext(): Observable<IssuingContext> {
    return this.http.get<IssuingContext>(apiUrl('/certificates/issuing-context'));
  }

  override summary(): Observable<CertificatesSummary> {
    return this.http.get<CertificatesSummary>(apiUrl('/certificates/summary'));
  }

  override searchMembers(query: string): Observable<readonly MemberOption[]> {
    return this.http.get<MemberOption[]>(apiUrl('/certificates/member-options'), {
      params: queryOf({ q: query.trim() }),
    });
  }

  override findMember(memberId: number): Observable<MemberOption> {
    return this.http.get<MemberOption>(apiUrl(`/certificates/member-options/${memberId}`));
  }

  override preview(command: IssueCertificateCommand): Observable<CertificatePreview> {
    return this.http.post<CertificatePreview>(apiUrl('/certificates/preview'), command);
  }

  override listCertificates(filter: CertificateFilter): Observable<CertificatePage> {
    return this.http.get<CertificatePage>(apiUrl('/certificates'), {
      params: queryOf({
        ...certificateQuery(filter),
        page: filter.page,
        pageSize: filter.pageSize,
      }),
    });
  }

  override getCertificate(id: number): Observable<CertificateDetail> {
    return this.http.get<CertificateDetail>(apiUrl(`/certificates/${id}`));
  }

  override issueCertificate(command: IssueCertificateCommand): Observable<CertificateListItem> {
    return this.http.post<CertificateListItem>(apiUrl('/certificates'), command);
  }

  override voidCertificate({ id, reason }: VoidCommand): Observable<CertificateListItem> {
    return this.http.post<CertificateListItem>(apiUrl(`/certificates/${id}/void`), { reason });
  }

  override certificatePdf(id: number): Observable<Blob> {
    return this.http.get(apiUrl(`/certificates/${id}/pdf`), { responseType: 'blob' });
  }

  override exportCertificates(filter: CertificateExportFilter): Observable<Blob> {
    return this.http.get(apiUrl('/certificates/export'), {
      params: queryOf(certificateQuery(filter)),
      responseType: 'blob',
    });
  }

  override listCards(filter: CardFilter): Observable<CardPage> {
    return this.http.get<CardPage>(apiUrl('/membership-cards'), {
      params: queryOf({
        status: filter.status,
        q: filter.q?.trim(),
        expiringInDays: filter.expiringInDays,
        page: filter.page,
        pageSize: filter.pageSize,
      }),
    });
  }

  override cardCandidates(query: CardCandidateQuery): Observable<CardCandidatePage> {
    return this.http.get<CardCandidatePage>(apiUrl('/membership-cards/candidates'), {
      params: queryOf({ q: query.q?.trim(), page: query.page, pageSize: query.pageSize }),
    });
  }

  override issueCard(command: IssueCardCommand): Observable<CardListItem> {
    return this.http.post<CardListItem>(apiUrl('/membership-cards'), command);
  }

  override voidCard({ id, reason }: VoidCommand): Observable<CardListItem> {
    return this.http.post<CardListItem>(apiUrl(`/membership-cards/${id}/void`), { reason });
  }

  override cardPdf(id: number): Observable<Blob> {
    return this.http.get(apiUrl(`/membership-cards/${id}/pdf`), { responseType: 'blob' });
  }
}
