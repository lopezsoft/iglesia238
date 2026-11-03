import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import { CongregationRegistration, PublicLegalEntity, RegistrationReceipt } from './congregation-registration.models';
import { CongregationRegistrationRepository } from './congregation-registration.repository';

interface ReceiptDto {
  readonly emailVerificationRequired: boolean;
  readonly congregationName: string;
  readonly devVerificationLink?: string | null;
}

/** Public registration over the REST API (`/api/public/*`). No session, no tenant header. */
@Injectable()
export class HttpCongregationRegistrationRepository extends CongregationRegistrationRepository {
  private readonly http = inject(HttpClient);

  listLegalEntities(): Observable<PublicLegalEntity[]> {
    return this.http.get<PublicLegalEntity[]>(apiUrl('/public/legal-entities'));
  }

  register(input: CongregationRegistration): Observable<RegistrationReceipt> {
    return this.http.post<ReceiptDto>(apiUrl('/public/congregation-registrations'), input).pipe(
      map((receipt) => ({
        emailVerificationRequired: receipt.emailVerificationRequired,
        congregationName: receipt.congregationName,
        devVerificationLink: receipt.devVerificationLink ?? null,
      })),
    );
  }
}
