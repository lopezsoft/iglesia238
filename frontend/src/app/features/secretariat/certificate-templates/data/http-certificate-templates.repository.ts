import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import {
  CertificateTypeChanges,
  CertificateTypeTemplate,
  TemplateCatalog,
  TemplatePreview,
} from './certificate-templates.models';
import { CertificateTemplatesRepository } from './certificate-templates.repository';

/** `/api/certificate-types/*`: needs the `certificate-types.manage` permission in a denomination scope. */
@Injectable()
export class HttpCertificateTemplatesRepository extends CertificateTemplatesRepository {
  private readonly http = inject(HttpClient);

  catalog(): Observable<TemplateCatalog> {
    return this.http.get<TemplateCatalog>(apiUrl('/certificate-types/templates'));
  }

  save(typeId: number, changes: CertificateTypeChanges): Observable<CertificateTypeTemplate> {
    return this.http.patch<CertificateTypeTemplate>(
      apiUrl(`/certificate-types/${typeId}`),
      changes,
    );
  }

  preview(typeId: number, changes: CertificateTypeChanges): Observable<TemplatePreview> {
    return this.http.post<TemplatePreview>(apiUrl(`/certificate-types/${typeId}/preview`), changes);
  }
}
