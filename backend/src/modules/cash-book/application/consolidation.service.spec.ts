import { contextFor } from '../../../../test/support/accounting-doubles.js';
import {
  buildCashBookWorld,
  codeOf,
} from '../../../../test/support/cash-book-world.js';
import {
  TENANT_A,
  TENANT_A_SIBLING,
  TENANT_A_WIDE,
} from '../../../../test/support/tenants.js';

const TODAY = '2026-11-02';

function withPendingContributions() {
  const world = buildCashBookWorld();
  const add = (accountId: number, amount: number, receivedOn = TODAY) =>
    world.book.addContribution(TENANT_A, { accountId, amount, receivedOn });
  add(world.ids.tithes, 90_000);
  add(world.ids.tithes, 350_000);
  add(world.ids.tithes, 200_000);
  add(world.ids.offerings, 300_000);
  add(world.ids.offerings, 180_000);
  add(world.ids.missionsIncome, 100_000);
  add(world.ids.missionsIncome, 80_000);
  return world;
}

describe('ConsolidationService', () => {
  it('previews the pending contributions grouped per account and destination fund', async () => {
    const world = withPendingContributions();

    const preview = await world.consolidation.preview(world.treasurer, TODAY);

    expect(preview.count).toBe(7);
    expect(preview.total).toBe(1_300_000);
    expect(
      preview.groups.map((g) => [g.accountCode, g.fundId, g.count, g.amount]),
    ).toEqual([
      ['410505', world.ids.local, 3, 640_000],
      ['410510', world.ids.local, 2, 480_000],
      ['410525', world.ids.missions, 2, 180_000],
    ]);
    expect(preview.nextVoucherCode).toBe('CI-2026-00001');
  });

  it('uses the oldest active fund when the account suggests none', async () => {
    const world = buildCashBookWorld();
    const loose = world.book.addAccount(1, '410599', { nature: 'INCOME' });
    world.book.addContribution(TENANT_A, {
      accountId: loose.id,
      amount: 5_000,
    });

    const preview = await world.consolidation.preview(world.treasurer, TODAY);

    expect(preview.groups[0].fundId).toBe(world.ids.local);
  });

  it('asks for an active fund when there is none to land in', async () => {
    const world = buildCashBookWorld();
    world.book.funds.forEach((fund) => (fund.isActive = false));
    const loose = world.book.addAccount(1, '410599', { nature: 'INCOME' });
    world.book.addContribution(TENANT_A, {
      accountId: loose.id,
      amount: 5_000,
    });

    expect(
      await codeOf(world.consolidation.preview(world.treasurer, TODAY)),
    ).toBe('NO_ACTIVE_FUND');
  });

  it('posts one inflow per account and fund under one CI voucher and links the contributions', async () => {
    const world = withPendingContributions();

    const result = await world.consolidation.consolidate(
      world.treasurer,
      TODAY,
    );

    expect(result).toEqual({
      voucherCode: 'CI-2026-00001',
      movements: 3,
      count: 7,
      total: 1_300_000,
    });
    expect(world.book.vouchers).toHaveLength(1);
    expect(world.book.lines).toHaveLength(3);
    expect(
      world.book.lines.every((l) => l.voucherId === world.book.vouchers[0].id),
    ).toBe(true);
    expect(world.book.lines[0]).toMatchObject({
      direction: 'IN',
      amount: 640_000,
      fundId: world.ids.local,
      periodId: world.ids.november,
    });
    expect(world.book.lines[0].description).toBe(
      'Consolidación de aportes del 02/11/2026 (3 aportes)',
    );
    expect(
      world.book.contributions.every((c) => c.cashTransactionId !== null),
    ).toBe(true);
    expect(world.audit.last).toMatchObject({
      action: 'CONTRIBUTIONS_CONSOLIDATED',
      entity: 'Voucher',
    });
    expect(
      await codeOf(world.consolidation.consolidate(world.treasurer, TODAY)),
    ).toBe('NOTHING_TO_CONSOLIDATE');
  });

  it('refuses a closed period, a month without period and a future date', async () => {
    const world = withPendingContributions();
    world.book.addContribution(TENANT_A, {
      accountId: world.ids.tithes,
      receivedOn: '2026-10-25',
    });

    expect(
      await codeOf(
        world.consolidation.consolidate(world.treasurer, '2026-10-25'),
      ),
    ).toBe('PERIOD_CLOSED');
    expect(
      await codeOf(
        world.consolidation.consolidate(world.treasurer, '2026-09-25'),
      ),
    ).toBe('PERIOD_NOT_FOUND');
    expect(
      await codeOf(
        world.consolidation.consolidate(world.treasurer, '2026-11-05'),
      ),
    ).toBe('FUTURE_DATE');
    expect(
      await codeOf(world.consolidation.consolidate(world.treasurer, 'ayer')),
    ).toBe('INVALID_DATE');
  });

  it('refuses an inactive destination fund and keeps everything untouched', async () => {
    const world = withPendingContributions();
    world.book.funds.find((f) => f.id === world.ids.missions)!.isActive = false;

    expect(
      await codeOf(world.consolidation.consolidate(world.treasurer, TODAY)),
    ).toBe('FUND_INACTIVE');
    expect(world.book.lines).toHaveLength(0);
    expect(
      world.book.contributions.every((c) => c.cashTransactionId === null),
    ).toBe(true);
  });

  it('fails with a conflict, so the transaction rolls back, when a contribution was taken meanwhile', async () => {
    const world = withPendingContributions();
    // Someone else links one contribution of the group before this call does.
    vi.spyOn(world.book, 'linkContributions').mockResolvedValue(1);

    expect(
      await codeOf(world.consolidation.consolidate(world.treasurer, TODAY)),
    ).toBe('CONSOLIDATION_CONFLICT');
  });

  it('only sees the pending contributions of its own sede and denomination', async () => {
    const world = withPendingContributions();
    world.book.addContribution(TENANT_A_SIBLING, {
      accountId: world.ids.tithes,
      amount: 777,
    });

    const own = await world.consolidation.preview(world.treasurer, TODAY);
    const sibling = await world.consolidation.preview(
      contextFor(TENANT_A_SIBLING, ['cash-transactions.write']),
      TODAY,
    );

    expect(own.total).toBe(1_300_000);
    expect(sibling).toMatchObject({ count: 1, total: 777 });
  });

  it('needs a sede', async () => {
    const world = withPendingContributions();
    const wide = contextFor(TENANT_A_WIDE, ['cash-transactions.write']);

    expect(await codeOf(world.consolidation.preview(wide, TODAY))).toBe(
      'CONGREGATION_SCOPE_REQUIRED',
    );
    expect(await codeOf(world.consolidation.consolidate(wide, TODAY))).toBe(
      'CONGREGATION_SCOPE_REQUIRED',
    );
  });
});
