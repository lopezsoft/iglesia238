import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { longDate } from '../application/certificate-document.js';
import type {
  CardPdfInput,
  CertificatePdfInput,
  DocumentPdfRenderer,
} from '../application/ports/document-pdf.renderer.js';

/** Palette of the printed documents (a PDF has no stylesheet, so the colors live here, in one place). */
const PALETTE = {
  ink: '#14233f',
  muted: '#5b6b86',
  rule: '#c9d2e0',
  primary: '#1f56c4',
  primarySoft: '#e7eefb',
  onPrimary: '#ffffff',
  onPrimaryMuted: '#c9d8f5',
  danger: '#d63b3b',
} as const;

const LETTER = { width: 612, height: 792 } as const;
const MARGIN = 64;
/** Side of the verification QR code in points (about 2.5 cm: reliable to scan from a printed page). */
const QR_SIZE = 72;
// CR80 (85.6 x 54 mm) in PDF points.
const CARD = { width: 242.65, height: 153.07 } as const;

const STATUS_LABELS = {
  VALID: 'VIGENTE',
  EXPIRED: 'VENCIDO',
  VOIDED: 'ANULADO',
} as const;

type Doc = InstanceType<typeof PDFDocument>;

/** Draws the documents with pdfkit and standard fonts (nothing to install or embed). */
@Injectable()
export class PdfkitDocumentRenderer implements DocumentPdfRenderer {
  certificate(input: CertificatePdfInput): Promise<Buffer> {
    return collect(
      new PDFDocument({
        size: [LETTER.width, LETTER.height],
        margin: MARGIN,
        info: {
          Title: input.snapshot.number,
          Author: input.snapshot.denominationName,
        },
      }),
      (doc) => drawCertificate(doc, input),
    );
  }

  card(input: CardPdfInput): Promise<Buffer> {
    return collect(
      new PDFDocument({
        size: [CARD.width, CARD.height],
        margin: 0,
        info: { Title: input.cardNumber, Author: input.denominationName },
      }),
      (doc) => drawCard(doc, input),
    );
  }
}

function collect(doc: Doc, draw: (doc: Doc) => void): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      draw(doc);
      doc.end();
    } catch (error) {
      reject(
        error instanceof Error ? error : new Error('PDF rendering failed'),
      );
    }
  });
}

function drawCertificate(doc: Doc, input: CertificatePdfInput): void {
  const { snapshot } = input;
  const left = MARGIN;
  const width = LETTER.width - MARGIN * 2;

  // Frame.
  doc
    .lineWidth(1.5)
    .strokeColor(PALETTE.primary)
    .rect(32, 32, LETTER.width - 64, LETTER.height - 64)
    .stroke();
  doc
    .lineWidth(0.5)
    .strokeColor(PALETTE.rule)
    .rect(38, 38, LETTER.width - 76, LETTER.height - 76)
    .stroke();

  // Letterhead.
  doc.y = 70;
  doc
    .font('Helvetica-Bold')
    .fontSize(17)
    .fillColor(PALETTE.primary)
    .text(snapshot.denominationName, left, doc.y, { width, align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(PALETTE.muted)
    .text(
      `Razón social: ${snapshot.legalName}  ·  NIT ${snapshot.taxId}`,
      left,
      doc.y + 4,
      { width, align: 'center' },
    )
    .text(snapshot.locationLine, left, doc.y + 2, { width, align: 'center' });
  doc
    .moveTo(left, doc.y + 12)
    .lineTo(left + width, doc.y + 12)
    .lineWidth(0.5)
    .strokeColor(PALETTE.rule)
    .stroke();

  // Number and title.
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(PALETTE.muted)
    .text(`No. ${snapshot.number}`, left, doc.y + 26, {
      width,
      align: 'right',
    });
  doc
    .font('Times-Bold')
    .fontSize(23)
    .fillColor(PALETTE.ink)
    .text(snapshot.title, left, doc.y + 28, {
      width,
      align: 'center',
      characterSpacing: 1,
    });

  // Body.
  doc
    .font('Times-Roman')
    .fontSize(13)
    .fillColor(PALETTE.muted)
    .text(snapshot.intro, left, doc.y + 38, { width, align: 'center' });
  // A donations certificate also carries a table: its text is set a little tighter so everything fits above the signatures.
  const donation = snapshot.donation;
  doc
    .font('Times-Roman')
    .fontSize(donation ? 12 : 14)
    .fillColor(PALETTE.ink)
    .text(snapshot.body, left, doc.y + (donation ? 12 : 16), {
      width,
      align: 'justify',
      lineGap: donation ? 3 : 5,
    });
  if (donation) {
    drawDonationTable(doc, donation, left, width);
  }
  if (snapshot.notes) {
    doc
      .font('Times-Italic')
      .fontSize(12)
      .fillColor(PALETTE.ink)
      .text(`Observaciones: ${snapshot.notes}`, left, doc.y + 16, {
        width,
        align: 'justify',
      });
  }
  doc
    .font('Times-Roman')
    .fontSize(donation ? 11 : 13)
    .fillColor(PALETTE.ink)
    .text(snapshot.closing, left, doc.y + (donation ? 12 : 20), {
      width,
      align: 'left',
    });
  if (input.expiresOn) {
    doc
      .font('Times-Italic')
      .fontSize(11)
      .fillColor(PALETTE.muted)
      .text(`Válido hasta el ${longDate(input.expiresOn)}.`, left, doc.y + 8, {
        width,
      });
  }

  // Signatures.
  const signatureY = LETTER.height - 230;
  const signatureWidth = (width - 48) / 2;
  drawSignature(
    doc,
    left,
    signatureY,
    signatureWidth,
    snapshot.pastorName,
    snapshot.pastorTitle,
  );
  drawSignature(
    doc,
    left + signatureWidth + 48,
    signatureY,
    signatureWidth,
    snapshot.secretaryName ?? '',
    snapshot.secretaryTitle,
  );

  // Footer: with a verification link the QR code does the checking; without it only the number is printed.
  if (input.verificationUrl) {
    drawQrCode(
      doc,
      input.verificationUrl,
      (LETTER.width - QR_SIZE) / 2,
      LETTER.height - 84 - 14 - QR_SIZE,
      QR_SIZE,
    );
  }
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(PALETTE.muted)
    .text(
      input.verificationUrl
        ? `Escanee el código QR para verificar la autenticidad de este documento (${snapshot.number}). Emitido por ${snapshot.issuedByName}.`
        : `Verifique la autenticidad con el número del documento (${snapshot.number}). Emitido por ${snapshot.issuedByName}.`,
      left,
      LETTER.height - 84,
      { width, align: 'center' },
    );

  if (input.voided) {
    watermark(doc, 'ANULADO', LETTER.width / 2, LETTER.height / 2, 110);
  }
}

/** Concept, receipts and amount of each line, then the total: the detail of a donations certificate. */
function drawDonationTable(
  doc: Doc,
  donation: NonNullable<CertificatePdfInput['snapshot']['donation']>,
  left: number,
  width: number,
): void {
  const rowHeight = 14;
  const receiptsWidth = 70;
  const amountWidth = 110;
  const conceptWidth = width - receiptsWidth - amountWidth;
  const cell = (
    text: string,
    x: number,
    y: number,
    w: number,
    align: 'left' | 'right',
  ) =>
    doc.text(text, x, y, {
      width: w - 6,
      align,
      lineBreak: false,
      ellipsis: true,
    });

  let y = doc.y + 10;
  doc.rect(left, y, width, rowHeight).fill(PALETTE.primarySoft);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(PALETTE.primary);
  cell('Concepto', left + 6, y + 3.5, conceptWidth, 'left');
  cell('Recibos', left + conceptWidth, y + 3.5, receiptsWidth, 'right');
  cell(
    'Valor',
    left + conceptWidth + receiptsWidth,
    y + 3.5,
    amountWidth,
    'right',
  );
  y += rowHeight;

  doc.font('Helvetica').fontSize(9).fillColor(PALETTE.ink);
  for (const line of donation.lines) {
    cell(line.concept, left + 6, y + 3.5, conceptWidth, 'left');
    cell(
      String(line.receipts),
      left + conceptWidth,
      y + 3.5,
      receiptsWidth,
      'right',
    );
    cell(
      line.amount,
      left + conceptWidth + receiptsWidth,
      y + 3.5,
      amountWidth,
      'right',
    );
    y += rowHeight;
    doc
      .moveTo(left, y)
      .lineTo(left + width, y)
      .lineWidth(0.4)
      .strokeColor(PALETTE.rule)
      .stroke();
  }

  doc.font('Helvetica-Bold').fontSize(9).fillColor(PALETTE.ink);
  cell('Total', left + 6, y + 3.5, conceptWidth, 'left');
  cell(
    String(donation.receipts),
    left + conceptWidth,
    y + 3.5,
    receiptsWidth,
    'right',
  );
  cell(
    donation.total,
    left + conceptWidth + receiptsWidth,
    y + 3.5,
    amountWidth,
    'right',
  );
  y += rowHeight;
  // The text that follows starts below the table.
  doc.x = left;
  doc.y = y;
}

/** Draws the QR code as vector squares (no image to embed, sharp at any print size). */
function drawQrCode(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  size: number,
): void {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const cell = size / modules.size;
  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (modules.get(row, col)) {
        doc.rect(x + col * cell, y + row * cell, cell, cell);
      }
    }
  }
  doc.fillColor(PALETTE.ink).fill();
}

function drawSignature(
  doc: Doc,
  x: number,
  y: number,
  width: number,
  name: string,
  title: string,
): void {
  doc
    .moveTo(x, y)
    .lineTo(x + width, y)
    .lineWidth(0.75)
    .strokeColor(PALETTE.ink)
    .stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(PALETTE.ink)
    .text(name, x, y + 6, { width, align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(PALETTE.muted)
    .text(title, x, doc.y + 2, { width, align: 'center' });
}

function watermark(
  doc: Doc,
  text: string,
  centerX: number,
  centerY: number,
  size: number,
): void {
  doc.save();
  doc.rotate(-30, { origin: [centerX, centerY] });
  doc.fillOpacity(0.16).fillColor(PALETTE.danger).font('Helvetica-Bold');
  doc.fontSize(size);
  const textWidth = doc.widthOfString(text);
  doc.text(text, centerX - textWidth / 2, centerY - size / 2, {
    lineBreak: false,
  });
  doc.restore();
}

function drawCard(doc: Doc, input: CardPdfInput): void {
  const inset = 12;
  const innerWidth = CARD.width - inset * 2;

  // Front.
  doc.rect(0, 0, CARD.width, CARD.height).fill(PALETTE.primary);
  doc.rect(0, CARD.height - 22, CARD.width, 22).fill(PALETTE.ink);
  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor(PALETTE.onPrimary)
    .text(input.denominationName.toUpperCase(), inset, 14, {
      width: innerWidth,
      lineBreak: false,
      ellipsis: true,
    });
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(PALETTE.onPrimaryMuted)
    .text(input.congregationName, inset, 28, {
      width: innerWidth,
      lineBreak: false,
      ellipsis: true,
    });
  doc
    .font('Helvetica')
    .fontSize(6.5)
    .fillColor(PALETTE.onPrimaryMuted)
    .text('CARNÉ DE MIEMBRO', inset, 58, { width: innerWidth });
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(PALETTE.onPrimary)
    .text(input.memberName, inset, 68, { width: innerWidth, height: 34 });
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(PALETTE.onPrimary)
    .text(input.cardNumber, inset, CARD.height - 16, {
      width: innerWidth,
      lineBreak: false,
    });
  if (input.status !== 'VALID') {
    watermark(
      doc,
      STATUS_LABELS[input.status],
      CARD.width / 2,
      CARD.height / 2,
      34,
    );
  }

  // Back.
  doc.addPage({ size: [CARD.width, CARD.height], margin: 0 });
  doc.rect(0, 0, CARD.width, CARD.height).fill(PALETTE.primarySoft);
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(PALETTE.primary)
    .text('DATOS DEL CARNÉ', inset, 14, { width: innerWidth });
  const rows: ReadonlyArray<readonly [string, string]> = [
    ['Número', input.cardNumber],
    ['Emisión', longDate(input.issuedOn)],
    ['Vencimiento', longDate(input.expiresOn)],
    ['Estado', STATUS_LABELS[input.status]],
  ];
  let y = 32;
  for (const [label, value] of rows) {
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(PALETTE.muted)
      .text(label, inset, y, { width: 56, lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(PALETTE.ink)
      .text(value, inset + 58, y, { width: innerWidth - 58, lineBreak: false });
    y += 15;
  }
  doc
    .font('Helvetica')
    .fontSize(6)
    .fillColor(PALETTE.muted)
    .text(
      'Este carné es personal e intransferible. Si lo encuentras, entrégalo en la sede indicada en el anverso.',
      inset,
      CARD.height - 34,
      { width: innerWidth },
    );
  if (input.status !== 'VALID') {
    watermark(
      doc,
      STATUS_LABELS[input.status],
      CARD.width / 2,
      CARD.height / 2,
      34,
    );
  }
}
