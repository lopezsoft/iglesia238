import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { certificateNotFound } from '../certificate-errors.js';
import { certificateNumberOf, readScope } from '../certificate-mappers.js';
import type { PdfFile } from '../certificate.models.js';
import {
  DOCUMENT_PDF_RENDERER,
  type DocumentPdfRenderer,
} from '../ports/document-pdf.renderer.js';
import {
  CERTIFICATE_REPOSITORY,
  type CertificateRepository,
} from '../ports/certificate.repository.js';

/** PDF of an issued certificate, always drawn from its snapshot: a reprint is identical to the original. */
@Injectable()
export class RenderCertificatePdfUseCase {
  constructor(
    @Inject(CERTIFICATE_REPOSITORY)
    private readonly certificates: CertificateRepository,
    @Inject(DOCUMENT_PDF_RENDERER)
    private readonly renderer: DocumentPdfRenderer,
  ) {}

  async execute(tenant: TenantContext, id: number): Promise<PdfFile> {
    const record = await this.certificates.findById(readScope(tenant), id);
    if (!record) {
      throw certificateNotFound();
    }
    const content = await this.renderer.certificate({
      snapshot: record.snapshot,
      issuedOn: record.issuedOn,
      expiresOn: record.expiresOn,
      voided: record.voidedAt !== null,
    });
    return { filename: `${certificateNumberOf(record)}.pdf`, content };
  }
}
