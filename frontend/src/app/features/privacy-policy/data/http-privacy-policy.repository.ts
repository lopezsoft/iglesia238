import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { apiUrl } from '../../../core/http/api-url';
import { PrivacyPolicy, PrivacyPolicyDraft, PrivacyPolicyList } from './privacy-policy.models';
import { PrivacyPolicyRepository } from './privacy-policy.repository';

const BASE = '/privacy-policies';

/** Policy administration over the REST API. The scope header is added by the scope interceptor. */
@Injectable()
export class HttpPrivacyPolicyRepository extends PrivacyPolicyRepository {
  private readonly http = inject(HttpClient);

  list(): Observable<PrivacyPolicyList> {
    return this.http.get<PrivacyPolicyList>(apiUrl(BASE));
  }

  create(draft: PrivacyPolicyDraft): Observable<PrivacyPolicy> {
    return this.http.post<PrivacyPolicy>(apiUrl(BASE), draft);
  }

  update(id: number, draft: PrivacyPolicyDraft): Observable<PrivacyPolicy> {
    return this.http.put<PrivacyPolicy>(apiUrl(`${BASE}/${id}`), draft);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(apiUrl(`${BASE}/${id}`)).pipe(map(() => undefined));
  }

  publish(id: number): Observable<PrivacyPolicy> {
    return this.http.post<PrivacyPolicy>(apiUrl(`${BASE}/${id}/publish`), {});
  }
}
