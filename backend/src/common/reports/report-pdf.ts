export const REPORT_PDF_RENDERER = Symbol('REPORT_PDF_RENDERER');

/**
 * Who issues the report: the legal entity (with its NIT) and the sede. The same lines every printed document shows.
 * A report of the whole denomination has no single legal entity: `legalName` and `taxId` are null and
 * `congregationName` says what it covers ("Todas las sedes").
 */
export interface ReportLetterhead {
  readonly denominationName: string;
  readonly legalName: string | null;
  readonly taxId: string | null;
  readonly congregationName: string;
}

export interface ReportColumn {
  readonly header: string;
  /** Share of the table width: the columns divide it in proportion to their weights. */
  readonly weight: number;
  readonly align?: 'left' | 'right' | 'center';
}

/** A figure of the strip above the table ("Saldo inicial", "$ 1.250.000"). */
export interface ReportSummaryItem {
  readonly label: string;
  readonly value: string;
}

export interface ReportRow {
  readonly cells: readonly string[];
  /** `strong` for a subtotal or a balance line, `muted` for a line that does not count (a reversed one). */
  readonly style?: 'normal' | 'strong' | 'muted';
}

/**
 * Everything a tabular report needs to be printed. The caller formats every value (money, dates) as text: the
 * renderer only lays it out, so the same engine serves any report.
 */
export interface ReportDocument {
  readonly title: string;
  readonly subtitle?: string;
  readonly letterhead: ReportLetterhead;
  /** ISO date of the day it is generated, printed in the footer. */
  readonly generatedOn: string;
  readonly summary?: readonly ReportSummaryItem[];
  readonly columns: readonly ReportColumn[];
  readonly rows: readonly ReportRow[];
  /** A last row with the totals; same number of cells as columns. */
  readonly totals?: readonly string[];
  /** Printed instead of the rows when there are none. */
  readonly emptyMessage?: string;
  readonly notes?: readonly string[];
  /** Titles of the signature lines ("Tesorero(a)", "Pastor(a)"), signed by hand. */
  readonly signatures?: readonly string[];
  readonly orientation?: 'portrait' | 'landscape';
  /** Logo of the denomination (PNG or JPEG bytes) and its color (#RRGGBB). Both optional. */
  readonly logo?: Buffer;
  readonly accentColor?: string;
}

/** Renders a report as a printable document. The adapter decides the library. */
export interface ReportPdfRenderer {
  render(report: ReportDocument): Promise<Buffer>;
}
