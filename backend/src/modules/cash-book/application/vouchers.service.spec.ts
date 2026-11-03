import { contextFor } from '../../../../test/support/accounting-doubles.js';
import {
  buildCashBookWorld,
  codeOf,
  type CashBookWorld,
} from '../../../../test/support/cash-book-world.js';
import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import { TENANT_A, TENANT_A_WIDE } from '../../../../test/support/tenants.js';

const CASH = ['cash-transactions.write'];

function withVouchers() {
  const world = buildCashBookWorld();
  const add = (type: string, postedOn: string, amount: number) =>
    world.book.addLine(TENANT_A, {
      periodId: world.ids.november,
      accountId: world.ids.expense,
      fundId: world.ids.local,
      direction: type === 'CI' ? 'IN' : 'OUT',
      postedOn,
      amount,
      voucherType: type,
    });
  add('CE', '2026-11-01', 100_000);
  add('CI', '2026-11-02', 250_000);
  add('REC', '2026-11-02', 90_000);
  return world;
}

const page = { page: 1, pageSize: 25 };

describe('VouchersService', () => {
  it('lists the vouchers the user may read, newest first, with their code and amount', async () => {
    const world = withVouchers();

    const result = await world.vouchers.list(world.treasurer, page);

    // The treasurer has cash-transactions.write only: no receipts.
    expect(result.items.map((v) => v.code)).toEqual([
      'CI-2026-00002',
      'CE-2026-00001',
    ]);
    expect(result.items[0]).toMatchObject({
      type: 'CI',
      typeLabel: 'Comprobante de ingreso',
      amount: 250_000,
      status: 'ISSUED',
      movements: 1,
    });
    expect(result.total).toBe(2);
  });

  it('shows receipts only to who reads contributions', async () => {
    const world = withVouchers();
    const reader = contextFor(TENANT_A, ['contributions.read']);

    const result = await world.vouchers.list(reader, page);

    expect(result.items.map((v) => v.type)).toEqual(['REC']);
    expect(
      await codeOf(world.vouchers.list(reader, { ...page, type: 'CE' })),
    ).toBe('FORBIDDEN');
  });

  it('filters by type, dates, state and number, and paginates', async () => {
    const world = withVouchers();

    expect(
      (await world.vouchers.list(world.treasurer, { ...page, type: 'CE' }))
        .total,
    ).toBe(1);
    expect(
      (
        await world.vouchers.list(world.treasurer, {
          ...page,
          from: '2026-11-02',
          to: '2026-11-30',
        })
      ).total,
    ).toBe(1);
    expect(
      (
        await world.vouchers.list(world.treasurer, {
          ...page,
          status: 'VOIDED',
        })
      ).total,
    ).toBe(0);
    expect(
      (await world.vouchers.list(world.treasurer, { ...page, number: 2 }))
        .items,
    ).toHaveLength(1);
    const second = await world.vouchers.list(world.treasurer, {
      page: 2,
      pageSize: 1,
    });
    expect(second.items.map((v) => v.code)).toEqual(['CE-2026-00001']);
    expect(second).toMatchObject({ total: 2, page: 2, pageSize: 1 });
  });

  it('validates the type and the dates', async () => {
    const world = withVouchers();

    expect(
      await codeOf(
        world.vouchers.list(world.treasurer, { ...page, type: 'XX' }),
      ),
    ).toBe('INVALID_VOUCHER_TYPE');
    expect(
      await codeOf(
        world.vouchers.list(world.treasurer, { ...page, from: '2026-13-01' }),
      ),
    ).toBe('INVALID_DATE');
  });

  it('shows the detail of a voucher with its lines', async () => {
    const world = withVouchers();
    const voucher = (await world.vouchers.list(world.treasurer, page)).items[0];

    const detail = await world.vouchers.get(world.treasurer, voucher.id);

    expect(detail.lines).toHaveLength(1);
    expect(detail.lines[0]).toMatchObject({
      amount: 250_000,
      fundName: 'Fondo Local',
      direction: 'IN',
    });
  });

  it('refuses the detail of a receipt to a user without contributions.read', async () => {
    const world = withVouchers();
    const receipt = world.book.vouchers.find((v) => v.type === 'REC')!;

    expect(await codeOf(world.vouchers.get(world.treasurer, receipt.id))).toBe(
      'FORBIDDEN',
    );
  });

  it('asks a denomination-wide session for the sede', async () => {
    const world = withVouchers();
    const wide = contextFor(TENANT_A_WIDE, CASH);

    expect(await codeOf(world.vouchers.list(wide, page))).toBe(
      'CONGREGATION_SCOPE_REQUIRED',
    );
    const result = await world.vouchers.list(wide, {
      ...page,
      congregationId: 10,
    });
    expect(result.total).toBe(2);
    // A sede of another denomination simply has no vouchers.
    expect(
      (await world.vouchers.list(wide, { ...page, congregationId: 20 })).total,
    ).toBe(0);
  });

  describeCrossTenantIsolation('reading a voucher', {
    arrange: (owner) => {
      const world = shared();
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
    act: (scope, id) => shared().vouchers.get(contextFor(scope, CASH), id),
  });
});

let sharedWorld: CashBookWorld | undefined;
function shared(): CashBookWorld {
  sharedWorld ??= buildCashBookWorld();
  return sharedWorld;
}
