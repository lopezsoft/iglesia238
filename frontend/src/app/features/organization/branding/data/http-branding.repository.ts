import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import { Branding } from './branding.models';
import { BrandingRepository } from './branding.repository';

/** `/api/branding`: needs the `branding.manage` permission in a denomination scope. */
@Injectable()
export class HttpBrandingRepository extends BrandingRepository {
  private readonly http = inject(HttpClient);

  get(): Observable<Branding> {
    return this.http.get<Branding>(apiUrl('/branding'));
  }

  uploadLogo(contentBase64: string): Observable<Branding> {
    return this.http.put<Branding>(apiUrl('/branding/logo'), { contentBase64 });
  }

  removeLogo(): Observable<Branding> {
    return this.http.delete<Branding>(apiUrl('/branding/logo'));
  }

  updateColor(primaryColor: string | null): Observable<Branding> {
    return this.http.patch<Branding>(apiUrl('/branding'), { primaryColor });
  }
}
