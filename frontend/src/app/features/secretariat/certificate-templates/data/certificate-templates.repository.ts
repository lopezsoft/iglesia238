import { Observable } from 'rxjs';
import {
  CertificateTypeChanges,
  CertificateTypeTemplate,
  TemplateCatalog,
  TemplatePreview,
} from './certificate-templates.models';

/** Port of the editor of the printed texts of the certificate types (a task of the denomination). */
export abstract class CertificateTemplatesRepository {
  abstract catalog(): Observable<TemplateCatalog>;
  abstract save(
    typeId: number,
    changes: CertificateTypeChanges,
  ): Observable<CertificateTypeTemplate>;
  abstract preview(typeId: number, changes: CertificateTypeChanges): Observable<TemplatePreview>;
}
