import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type {
  ReportColumn,
  ReportDocument,
  ReportPdfRenderer,
  ReportRow,
} from '../../common/reports/report-pdf.js';

/** Palette of the printed reports (a PDF has no stylesheet, so the colors live here, in one place). */
const PALETTE = {
  ink: '#14233f',
  muted: '#5b6b86',
  rule: '#c9d2e0',
  primary: '#1f56c4',
} as const;

const MARGIN = 40;
const LOGO_BOX = [56, 48] as const;
const CELL_PADDING = 4;
const BODY_SIZE = 8;
const FOOTER_HEIGHT = 26;
const SIGNATURE_HEIGHT = 84;
const SUMMARY_PER_ROW = 4;

type Doc = InstanceType<typeof PDFDocument>;

/** A color mixed with white: the soft background that goes with the color of the denomination. */
function tint(hex: string, amount = 0.9): string {
  const mixed = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16);
    return Math.round(channel + (255 - channel) * amount)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${mixed.join('')}`;
}

const longDate = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDate(isoDate: string): string {
  return longDate.format(new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`));
}

/** Draws tabular reports with pdfkit and standard fonts (nothing to install or embed). */
@Injectable()
export class PdfkitReportRenderer implements ReportPdfRenderer {
  render(report: ReportDocument): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: report.orientation ?? 'portrait',
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: report.title,
        Author: report.letterhead.denominationName,
      },
    });
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      try {
        new ReportLayout(doc, report).draw();
        doc.end();
      } catch (error) {
        reject(
          error instanceof Error ? error : new Error('PDF rendering failed'),
        );
      }
    });
  }
}

/** One report on one document: it knows where the cursor is and when the page is full. */
class ReportLayout {
  private readonly accent: string;
  private readonly left = MARGIN;
  private readonly width: number;
  private readonly columnWidths: readonly number[];

  constructor(
    private readonly doc: Doc,
    private readonly report: ReportDocument,
  ) {
    this.accent = report.accentColor ?? PALETTE.primary;
    this.width = doc.page.width - MARGIN * 2;
    const total = report.columns.reduce(
      (sum, column) => sum + column.weight,
      0,
    );
    this.columnWidths = report.columns.map(
      (column) => (column.weight / total) * this.width,
    );
  }

  /** Lowest y a line of the body may reach: the footer lives below it. */
  private get bottom(): number {
    return this.doc.page.height - MARGIN - FOOTER_HEIGHT;
  }

  draw(): void {
    this.letterhead();
    this.summary();
    this.table();
    this.notes();
    this.signatures();
    this.footers();
  }

  // ---- first page ---------------------------------------------------------------------------------

  private letterhead(): void {
    const { doc, report, left, width } = this;
    const { letterhead } = report;
    const logoSpace = report.logo ? LOGO_BOX[0] + 12 : 0;
    const top = MARGIN;
    if (report.logo) {
      try {
        doc.image(report.logo, left, top, { fit: [LOGO_BOX[0], LOGO_BOX[1]] });
      } catch {
        // A report without logo beats no report.
      }
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(this.accent)
      .text(letterhead.denominationName, left + logoSpace, top, {
        width: width - logoSpace,
      });
    doc.font('Helvetica').fontSize(8.5).fillColor(PALETTE.muted);
    if (letterhead.legalName) {
      const nit = letterhead.taxId ? `  ·  NIT ${letterhead.taxId}` : '';
      doc.text(
        `Razón social: ${letterhead.legalName}${nit}`,
        left + logoSpace,
        doc.y + 2,
        { width: width - logoSpace },
      );
    }
    doc.text(letterhead.congregationName, left + logoSpace, doc.y + 1, {
      width: width - logoSpace,
    });
    doc.y = Math.max(doc.y, top + (report.logo ? LOGO_BOX[1] : 0)) + 8;
    this.rule(doc.y, PALETTE.rule);

    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(PALETTE.ink)
      .text(report.title, left, doc.y + 10, { width });
    if (report.subtitle) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(PALETTE.muted)
        .text(report.subtitle, left, doc.y + 2, { width });
    }
    doc.y += 10;
  }

  private summary(): void {
    const { doc, report, left, width } = this;
    const items = report.summary ?? [];
    if (items.length === 0) {
      return;
    }
    const perRow = Math.min(SUMMARY_PER_ROW, items.length);
    const boxWidth = width / perRow;
    const boxHeight = 34;
    for (let start = 0; start < items.length; start += perRow) {
      if (doc.y + boxHeight > this.bottom) {
        this.newPage();
      }
      const top = doc.y;
      doc.rect(left, top, width, boxHeight).fill(tint(this.accent, 0.93));
      items.slice(start, start + perRow).forEach((item, index) => {
        const x = left + index * boxWidth + 8;
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(PALETTE.muted)
          .text(item.label, x, top + 6, {
            width: boxWidth - 12,
            lineBreak: false,
            ellipsis: true,
          });
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor(PALETTE.ink)
          .text(item.value, x, top + 18, {
            width: boxWidth - 12,
            lineBreak: false,
            ellipsis: true,
          });
      });
      doc.y = top + boxHeight + 4;
    }
    doc.y += 6;
  }

  // ---- table --------------------------------------------------------------------------------------

  private table(): void {
    const { doc, report } = this;
    this.tableHeader();
    if (report.rows.length === 0) {
      doc
        .font('Helvetica-Oblique')
        .fontSize(BODY_SIZE + 1)
        .fillColor(PALETTE.muted)
        .text(
          report.emptyMessage ?? 'No hay registros para mostrar.',
          this.left + CELL_PADDING,
          doc.y + 8,
          { width: this.width - CELL_PADDING * 2 },
        );
      doc.y += 8;
      return;
    }
    for (const row of report.rows) {
      this.row(row);
    }
    if (report.totals) {
      this.totalsRow(report.totals);
    }
  }

  private tableHeader(): void {
    const { doc } = this;
    const height = 18;
    if (doc.y + height + 24 > this.bottom) {
      this.newPage();
    }
    const top = doc.y;
    doc.rect(this.left, top, this.width, height).fill(tint(this.accent));
    doc.font('Helvetica-Bold').fontSize(BODY_SIZE).fillColor(this.accent);
    this.report.columns.forEach((column, index) => {
      doc.text(column.header, this.cellX(index), top + 5, {
        width: this.columnWidths[index] - CELL_PADDING * 2,
        align: column.align ?? 'left',
        lineBreak: false,
        ellipsis: true,
      });
    });
    doc.y = top + height;
  }

  private row(row: ReportRow): void {
    const { doc } = this;
    const font = this.fontOf(row.style);
    const height = this.heightOf(row.cells, font);
    if (doc.y + height > this.bottom) {
      this.newPage();
      this.tableHeader();
    }
    const top = doc.y;
    doc
      .font(font)
      .fontSize(BODY_SIZE)
      .fillColor(row.style === 'muted' ? PALETTE.muted : PALETTE.ink);
    this.report.columns.forEach((column, index) => {
      doc.text(row.cells[index] ?? '', this.cellX(index), top + CELL_PADDING, {
        width: this.columnWidths[index] - CELL_PADDING * 2,
        align: column.align ?? 'left',
      });
    });
    doc.y = top + height;
    this.rule(doc.y, PALETTE.rule, 0.4);
  }

  private totalsRow(cells: readonly string[]): void {
    const { doc } = this;
    const height = this.heightOf(cells, 'Helvetica-Bold');
    if (doc.y + height > this.bottom) {
      this.newPage();
      this.tableHeader();
    }
    const top = doc.y;
    this.rule(top, this.accent, 1);
    doc.font('Helvetica-Bold').fontSize(BODY_SIZE).fillColor(PALETTE.ink);
    this.report.columns.forEach((column, index) => {
      doc.text(cells[index] ?? '', this.cellX(index), top + CELL_PADDING, {
        width: this.columnWidths[index] - CELL_PADDING * 2,
        align: column.align ?? 'left',
      });
    });
    doc.y = top + height;
  }

  /** Height of a row: that of its tallest cell, because a long text wraps inside its column. */
  private heightOf(cells: readonly string[], font: string): number {
    const { doc } = this;
    doc.font(font).fontSize(BODY_SIZE);
    const tallest = this.report.columns.reduce(
      (max: number, _column: ReportColumn, index) =>
        Math.max(
          max,
          doc.heightOfString(cells[index] ?? '', {
            width: this.columnWidths[index] - CELL_PADDING * 2,
          }),
        ),
      0,
    );
    return tallest + CELL_PADDING * 2;
  }

  private cellX(index: number): number {
    const before = this.columnWidths
      .slice(0, index)
      .reduce((sum, width) => sum + width, 0);
    return this.left + before + CELL_PADDING;
  }

  private fontOf(style: ReportRow['style']): string {
    if (style === 'strong') {
      return 'Helvetica-Bold';
    }
    return style === 'muted' ? 'Helvetica-Oblique' : 'Helvetica';
  }

  // ---- the end of the document --------------------------------------------------------------------

  private notes(): void {
    const { doc, report } = this;
    if (!report.notes || report.notes.length === 0) {
      return;
    }
    doc.font('Helvetica').fontSize(8).fillColor(PALETTE.muted);
    for (const note of report.notes) {
      const height = doc.heightOfString(note, { width: this.width });
      if (doc.y + height + 8 > this.bottom) {
        this.newPage();
      }
      doc.text(note, this.left, doc.y + 8, { width: this.width });
    }
  }

  /** The signatures stay together on the last page: if they do not fit, they all go to a new one. */
  private signatures(): void {
    const { doc, report, left, width } = this;
    const titles = report.signatures ?? [];
    if (titles.length === 0) {
      return;
    }
    if (doc.y + SIGNATURE_HEIGHT > this.bottom) {
      this.newPage();
    }
    const slot = width / titles.length;
    const lineY = Math.min(doc.y + SIGNATURE_HEIGHT - 28, this.bottom - 24);
    titles.forEach((title, index) => {
      const x = left + index * slot + 14;
      doc
        .moveTo(x, lineY)
        .lineTo(x + slot - 28, lineY)
        .lineWidth(0.75)
        .strokeColor(PALETTE.ink)
        .stroke();
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(PALETTE.muted)
        .text(title, x, lineY + 5, {
          width: slot - 28,
          align: 'center',
          lineBreak: false,
          ellipsis: true,
        });
    });
    doc.y = lineY + 20;
  }

  /** The footer of every page, written last because only then is the number of pages known. */
  private footers(): void {
    const { doc, report, left, width } = this;
    const { start, count } = doc.bufferedPageRange();
    for (let index = 0; index < count; index += 1) {
      doc.switchToPage(start + index);
      // The footer lives inside the bottom margin: without this, pdfkit would add a page to make room for it.
      doc.page.margins.bottom = 0;
      const y = doc.page.height - MARGIN - 12;
      this.rule(y - 6, PALETTE.rule, 0.4);
      doc.font('Helvetica').fontSize(7.5).fillColor(PALETTE.muted);
      doc.text(
        `${report.title} · Generado el ${formatDate(report.generatedOn)}`,
        left,
        y,
        { width: width - 90, lineBreak: false, ellipsis: true },
      );
      doc.text(`Página ${index + 1} de ${count}`, left + width - 90, y, {
        width: 90,
        align: 'right',
        lineBreak: false,
      });
    }
  }

  // ---- helpers ------------------------------------------------------------------------------------

  private newPage(): void {
    this.doc.addPage();
    this.doc.y = MARGIN;
    this.doc.x = this.left;
  }

  private rule(y: number, color: string, weight = 0.6): void {
    this.doc
      .moveTo(this.left, y)
      .lineTo(this.left + this.width, y)
      .lineWidth(weight)
      .strokeColor(color)
      .stroke();
  }
}
