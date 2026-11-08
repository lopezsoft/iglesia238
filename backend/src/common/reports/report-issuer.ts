import { Inject, Injectable } from '@nestjs/common';
import { DocumentBrandingService } from '../branding/document-branding.js';
import { NotFoundDomainException } from '../errors/domain.exception.js';
import type { TenantScope } from '../tenancy/tenant-scope.js';
import { Clock } from '../time/bogota-time.js';
import {
  REPORT_LETTERHEAD_READER,
  type ReportLetterheadReader,
} from './report-letterhead.js';
import {
  REPORT_PDF_RENDERER,
  type ReportDocument,
  type ReportPdfRenderer,
} from './report-pdf.js';

/** The parts of a report that belong to the report; the rest (who issues it, the look, the date) comes from here. */
export type ReportBody = Omit<
  ReportDocument,
  'letterhead' | 'generatedOn' | 'logo' | 'accentColor'
>;

/**
 * Prints a report on behalf of a sede (or the whole denomination): puts the letterhead, the logo and color of the
 * denomination and the date of the day around the body a module describes, and renders it. Every module that prints a
 * report goes through here, so they all look and fail the same way.
 */
@Injectable()
export class ReportIssuer {
  constructor(
    @Inject(REPORT_LETTERHEAD_READER)
    private readonly letterheads: ReportLetterheadReader,
    @Inject(REPORT_PDF_RENDERER) private readonly renderer: ReportPdfRenderer,
    private readonly branding: DocumentBrandingService,
    private readonly clock: Clock,
  ) {}

  async pdf(scope: TenantScope, body: ReportBody): Promise<Buffer> {
    const [letterhead, branding] = await Promise.all([
      this.letterheads.find(scope),
      this.branding.current(scope),
    ]);
    if (!letterhead) {
      throw new NotFoundDomainException('La sede no existe.');
    }
    return this.renderer.render({
      ...body,
      letterhead,
      generatedOn: this.clock.today(),
      ...branding,
    });
  }
}
