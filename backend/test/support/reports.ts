import type { DocumentBrandingService } from '../../src/common/branding/document-branding.js';
import { ReportIssuer } from '../../src/common/reports/report-issuer.js';
import type { ReportLetterheadReader } from '../../src/common/reports/report-letterhead.js';
import type {
  ReportDocument,
  ReportLetterhead,
  ReportPdfRenderer,
} from '../../src/common/reports/report-pdf.js';
import type { Clock } from '../../src/common/time/bogota-time.js';

export const TEST_LETTERHEAD: ReportLetterhead = {
  denominationName: 'Iglesia Cristiana Monte de Sion',
  legalName: 'Corporación Iglesia Cristiana Monte de Sion',
  taxId: '900.123.456-7',
  congregationName: 'Sede Central',
};

export const TEST_TODAY = '2026-11-08';

interface IssuerOptions {
  /** `null` is a sede that does not exist. */
  readonly letterhead?: ReportLetterhead | null;
  readonly branding?: object;
}

/** A real ReportIssuer over fakes: tests read the document it hands to the renderer. */
export function buildReportIssuer(options: IssuerOptions = {}) {
  const render = vi
    .fn<(report: ReportDocument) => Promise<Buffer>>()
    .mockResolvedValue(Buffer.from('%PDF-fake'));
  const find = vi
    .fn<ReportLetterheadReader['find']>()
    .mockResolvedValue(
      options.letterhead === undefined ? TEST_LETTERHEAD : options.letterhead,
    );
  const issuer = new ReportIssuer(
    { find },
    { render } satisfies ReportPdfRenderer,
    {
      current: vi.fn().mockResolvedValue(options.branding ?? {}),
    } as unknown as DocumentBrandingService,
    { today: () => TEST_TODAY } as Clock,
  );
  return {
    issuer,
    render,
    find,
    /** The document the report handed to the renderer. */
    sent: (): ReportDocument => render.mock.calls[0][0],
  };
}
