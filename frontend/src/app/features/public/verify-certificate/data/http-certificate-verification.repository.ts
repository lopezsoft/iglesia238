import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import { CertificateVerification } from './certificate-verification.models';
import { CertificateVerificationRepository } from './certificate-verification.repository';

/** `GET /api/public/certificates/verify`: anonymous, throttled per IP. */
@Injectable()
export class HttpCertificateVerificationRepository extends CertificateVerificationRepository {
  private readonly http = inject(HttpClient);

  verify(token: string): Observable<CertificateVerification> {
    return this.http.get<CertificateVerification>(apiUrl('/public/certificates/verify'), {
      params: new HttpParams().set('token', token),
    });
  }
}
