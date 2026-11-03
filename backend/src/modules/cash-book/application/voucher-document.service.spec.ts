import { contextFor } from '../../../../test/support/accounting-doubles.js';
import {
  buildCashBookWorld,
  codeOf,
} from '../../../../test/support/cash-book-world.js';
import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import { TENANT_A } from '../../../../test/support/tenants.js';
import type {
  VoucherPdfInput,
  VoucherPdfRenderer,
} from './ports/voucher-pdf.renderer.js';
import { VoucherDocumentService } from './voucher-document.service.js';

class RecordingRenderer implements VoucherPdfRenderer {
  readonly inputs: VoucherPdfInput[] = [];

  render(input: VoucherPdfInput): Promise<Buffer> {
    this.inputs.push(input);
    return Promise.resolve(Buffer.from('%PDF-fake'));
  }
}

function build() {
  const world = buildCashBookWorld();
  const renderer = new RecordingRenderer();
  const documents = new VoucherDocumentService(world.vouchers, renderer);
  return { world, renderer, documents };
}

function addReceipt(world: ReturnType<typeof build>['world']) {
  world.book.addLine(TENANT_A, {
    periodId: world.ids.november,
    accountId: world.ids.tithes,
    fundId: world.ids.local,
    direction: 'IN',
    postedOn: '2026-11-02',
    amount: 90_000,
    voucherType: 'REC',
  });
  const voucher = world.book.vouchers.at(-1)!;
  world.book.addContribution(TENANT_A, {
    accountId: world.ids.tithes,
    amount: 90_000,
    voucherId: voucher.id,
  });
  return voucher;
}

describe('VoucherDocumentService', () => {
  it('prints a receipt with its letterhead, code and contributions', async () => {
    const { world, renderer, documents } = build();
    const receipt = addReceipt(world);
    const reader = contextFor(TENANT_A, ['contributions.read']);

    const file = await documents.render(reader, receipt.id);

    expect(file.filename).toBe('REC-2026-00001.pdf');
    expect(file.content.subarray(0, 4).toString()).toBe('%PDF');
    expect(renderer.inputs[0]).toMatchObject({
      code: 'REC-2026-00001',
      title: 'Recibo de aporte',
      issuedOn: '2026-11-02',
      voided: false,
      letterhead: { congregationName: 'Sede Central', taxId: '900.123.456-7' },
    });
    expect(renderer.inputs[0].contributions[0]).toMatchObject({
      contributorName: 'Ana Pérez',
      paymentMethodLabel: 'Efectivo',
      amount: 90_000,
    });
  });

  it('prints a cash voucher with its lines and total', async () => {
    const { world, renderer, documents } = build();
    world.book.addLine(TENANT_A, {
      periodId: world.ids.november,
      accountId: world.ids.expense,
      fundId: world.ids.local,
      direction: 'OUT',
      postedOn: '2026-11-01',
      amount: 100_000,
      description: 'Servicios públicos',
      voucherType: 'CE',
    });
    const voucher = world.book.vouchers.at(-1)!;

    await documents.render(world.treasurer, voucher.id);

    expect(renderer.inputs[0]).toMatchObject({
      code: 'CE-2026-00001',
      title: 'Comprobante de egreso',
      total: 100_000,
    });
    expect(renderer.inputs[0].lines[0]).toMatchObject({
      description: 'Servicios públicos',
      direction: 'OUT',
      fundName: 'Fondo Local',
    });
  });

  it('stamps a voided voucher instead of refusing to print it', async () => {
    const { world, renderer, documents } = build();
    const receipt = addReceipt(world);
    receipt.voidedAt = new Date('2026-11-02T16:00:00Z');
    receipt.voidReason = 'Valor mal digitado';

    await documents.render(
      contextFor(TENANT_A, ['contributions.read']),
      receipt.id,
    );

    expect(renderer.inputs[0]).toMatchObject({
      voided: true,
      voidReason: 'Valor mal digitado',
    });
  });

  it('applies the permission of each voucher type, as the detail does', async () => {
    const { world, renderer, documents } = build();
    const receipt = addReceipt(world);

    // The treasurer holds cash-transactions.write only: no receipts.
    expect(await codeOf(documents.render(world.treasurer, receipt.id))).toBe(
      'FORBIDDEN',
    );
    expect(renderer.inputs).toHaveLength(0);
  });

  it('answers 404 for a voucher that does not exist', async () => {
    const { world, documents } = build();

    expect(await codeOf(documents.render(world.treasurer, 999))).toBe(
      'NOT_FOUND',
    );
  });

  describeCrossTenantIsolation('printing a voucher', {
    arrange: (owner) => {
      const { world, documents } = build();
      shared = { documents };
      world.book.addLine(owner, {
        periodId: world.ids.november,
        accountId: world.ids.expense,
        fundId: world.ids.local,
        direction: 'OUT',
        postedOn: '2026-11-01',
        amount: 1_000,
        voucherType: 'CE',
      });
      return world.book.vouchers.at(-1)!.id;
    },
    act: (scope, id) =>
      shared!.documents.render(
        contextFor(scope, ['cash-transactions.write']),
        id,
      ),
  });
});

let shared: { documents: VoucherDocumentService } | undefined;
