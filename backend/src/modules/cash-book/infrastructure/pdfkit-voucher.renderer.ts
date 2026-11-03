import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type {
  VoucherPdfInput,
  VoucherPdfRenderer,
} from '../application/ports/voucher-pdf.renderer.js';

/** Palette of the printed voucher (a PDF has no stylesheet, so the colors live here, in one place). */
const PALETTE = {
  ink: '#14233f',
  muted: '#5b6b86',
  rule: '#c9d2e0',
  primary: '#1f56c4',
  danger: '#d63b3b',
} as const;

const LETTER = { width: 612, height: 792 } as const;
const MARGIN = 54;
const ROW_HEIGHT = 18;
const FOOTER_HEIGHT = 60;

type Doc = InstanceType<typeof PDFDocument>;

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const longDate = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDate(isoDate: string): string {
  return longDate.format(new Date(`${isoDate}T00:00:00.000Z`));
}

interface Column {
  readonly title: string;
  readonly width: number;
  readonly align: 'left' | 'right';
}

/** Draws receipts and cash vouchers with pdfkit and standard fonts (nothing to install or embed). */
@Injectable()
export class PdfkitVoucherRenderer implements VoucherPdfRenderer {
  render(input: VoucherPdfInput): Promise<Buffer> {
    const doc = new PDFDocument({
      size: [LETTER.width, LETTER.height],
      margin: MARGIN,
      bufferPages: true,
      info: { Title: input.code, Author: input.letterhead.denominationName },
    });
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      try {
        draw(doc, input);
        doc.end();
      } catch (error) {
        reject(
          error instanceof Error ? error : new Error('PDF rendering failed'),
        );
      }
    });
  }
}

function draw(doc: Doc, input: VoucherPdfInput): void {
  const width = LETTER.width - MARGIN * 2;
  drawLetterhead(doc, input, width);
  drawTitle(doc, input, width);

  if (input.contributions.length > 0) {
    drawTable(
      doc,
      [
        { title: 'Fecha', width: 78, align: 'left' },
        { title: 'Aporte', width: 120, align: 'left' },
        { title: 'Aportante', width: 160, align: 'left' },
        { title: 'Medio', width: 72, align: 'left' },
        { title: 'Valor', width: width - 78 - 120 - 160 - 72, align: 'right' },
      ],
      input.contributions.map((row) => [
        formatDate(row.receivedOn),
        row.typeName,
        row.contributorName ?? 'Aportante anónimo',
        row.paymentMethodLabel,
        money.format(row.amount),
      ]),
    );
  }
  if (input.lines.length > 0) {
    drawTable(
      doc,
      [
        { title: 'Cuenta', width: 150, align: 'left' },
        { title: 'Fondo', width: 90, align: 'left' },
        { title: 'Concepto', width: 170, align: 'left' },
        { title: 'Valor', width: width - 150 - 90 - 170, align: 'right' },
      ],
      input.lines.map((row) => [
        row.accountLabel,
        row.fundName,
        row.description,
        `${row.direction === 'OUT' ? '-' : ''}${money.format(row.amount)}`,
      ]),
    );
  }

  ensureRoom(doc, ROW_HEIGHT * 3);
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(PALETTE.ink)
    .text(`Total: ${money.format(input.total)}`, MARGIN, doc.y + 14, {
      width,
      align: 'right',
    });
  if (input.voided && input.voidReason) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(PALETTE.danger)
      .text(`Anulado: ${input.voidReason}`, MARGIN, doc.y + 8, { width });
  }

  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    doc.switchToPage(pages.start + index);
    drawFooter(doc, input, width, index + 1, pages.count);
    if (input.voided) {
      watermark(doc);
    }
  }
}

function drawLetterhead(doc: Doc, input: VoucherPdfInput, width: number): void {
  const { letterhead } = input;
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(PALETTE.primary)
    .text(letterhead.denominationName, MARGIN, MARGIN, {
      width,
      align: 'center',
    });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(PALETTE.muted)
    .text(
      `${letterhead.legalName}  ·  NIT ${letterhead.taxId}`,
      MARGIN,
      doc.y + 3,
      { width, align: 'center' },
    )
    .text(letterhead.congregationName, MARGIN, doc.y + 2, {
      width,
      align: 'center',
    });
  doc
    .moveTo(MARGIN, doc.y + 10)
    .lineTo(MARGIN + width, doc.y + 10)
    .lineWidth(0.5)
    .strokeColor(PALETTE.rule)
    .stroke();
  doc.y += 22;
}

function drawTitle(doc: Doc, input: VoucherPdfInput, width: number): void {
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(PALETTE.ink)
    .text(input.title.toUpperCase(), MARGIN, doc.y, { width, align: 'left' });
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor(PALETTE.muted)
    .text(`No. ${input.code}`, MARGIN, doc.y + 2, { width })
    .text(`Fecha: ${formatDate(input.issuedOn)}`, MARGIN, doc.y + 2, { width });
  doc.y += 16;
}

function ensureRoom(doc: Doc, needed: number): void {
  if (doc.y + needed > LETTER.height - MARGIN - FOOTER_HEIGHT) {
    doc.addPage();
  }
}

function drawTable(
  doc: Doc,
  columns: readonly Column[],
  rows: readonly (readonly string[])[],
): void {
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const drawHeader = () => {
    const top = doc.y;
    let x = MARGIN;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(PALETTE.muted);
    for (const column of columns) {
      doc.text(column.title, x, top, {
        width: column.width - 6,
        align: column.align,
        lineBreak: false,
      });
      x += column.width;
    }
    doc
      .moveTo(MARGIN, top + 13)
      .lineTo(MARGIN + tableWidth, top + 13)
      .lineWidth(0.5)
      .strokeColor(PALETTE.rule)
      .stroke();
    doc.y = top + ROW_HEIGHT;
  };

  ensureRoom(doc, ROW_HEIGHT * 2);
  drawHeader();
  for (const row of rows) {
    if (doc.y + ROW_HEIGHT > LETTER.height - MARGIN - FOOTER_HEIGHT) {
      doc.addPage();
      drawHeader();
    }
    const top = doc.y;
    let x = MARGIN;
    doc.font('Helvetica').fontSize(9.5).fillColor(PALETTE.ink);
    columns.forEach((column, index) => {
      doc.text(row[index], x, top, {
        width: column.width - 6,
        align: column.align,
        lineBreak: false,
        ellipsis: true,
      });
      x += column.width;
    });
    doc.y = top + ROW_HEIGHT;
  }
}

function drawFooter(
  doc: Doc,
  input: VoucherPdfInput,
  width: number,
  page: number,
  pages: number,
): void {
  // Writing below the bottom margin would open a new page: lift the margin while drawing the footer.
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(PALETTE.muted)
    .text(
      `${input.code}  ·  Documento generado por el sistema de gestión de la iglesia  ·  Página ${page} de ${pages}`,
      MARGIN,
      LETTER.height - MARGIN - 8,
      { width, align: 'center', lineBreak: false },
    );
  doc.page.margins.bottom = bottom;
}

function watermark(doc: Doc): void {
  const centerX = LETTER.width / 2;
  const centerY = LETTER.height / 2;
  doc.save();
  doc.rotate(-30, { origin: [centerX, centerY] });
  doc.fillOpacity(0.16).fillColor(PALETTE.danger).font('Helvetica-Bold');
  doc.fontSize(110);
  const textWidth = doc.widthOfString('ANULADO');
  doc.text('ANULADO', centerX - textWidth / 2, centerY - 55, {
    lineBreak: false,
  });
  doc.restore();
}
