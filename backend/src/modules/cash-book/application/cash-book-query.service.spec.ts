import { contextFor } from '../../../../test/support/accounting-doubles.js';
import {
  buildCashBookWorld,
  codeOf,
  type CashBookWorld,
} from '../../../../test/support/cash-book-world.js';
import {
  TENANT_A,
  TENANT_A_SIBLING,
  TENANT_A_WIDE,
} from '../../../../test/support/tenants.js';

const TODAY = '2026-11-02';

function line(
  world: CashBookWorld,
  direction: 'IN' | 'OUT',
  amount: number,
  postedOn: string,
  description = 'Movimiento',
  accountId = direction === 'IN' ? world.ids.tithes : world.ids.expense,
) {
  return world.book.addLine(TENANT_A, {
    periodId: world.ids.november,
    accountId,
    fundId: world.ids.local,
    direction,
    postedOn,
    amount,
    description,
    voucherType: direction === 'IN' ? 'CI' : 'CE',
  });
}

const query = (world: CashBookWorld, overrides = {}) => ({
  fundId: world.ids.local,
  periodId: world.ids.november,
  page: 1,
  pageSize: 15,
  ...overrides,
});

describe('CashBookQueryService.options', () => {
  it('gives the catalogs of the sede: active funds first, postable accounts and periods newest first', async () => {
    const world = buildCashBookWorld();
    world.book.addFund(1, 'Campamento 2025', false);
    world.book.addFund(2, 'Fondo de otra denominación');
    world.book.addAccount(1, '5105', { isPostable: false });

    const options = await world.queries.options(world.treasurer);

    expect(options).toMatchObject({
      today: TODAY,
      congregationId: 10,
      congregationName: 'Sede Central',
    });
    expect(options.funds.map((f) => f.name)).toEqual([
      'Fondo Local',
      'Misiones',
      'Campamento 2025',
    ]);
    expect(options.periods.map((p) => p.label)).toEqual([
      'Noviembre 2026',
      'Octubre 2026',
    ]);
    expect(options.accounts.map((a) => a.code)).toEqual([
      '410505',
      '410510',
      '410525',
      '510505',
    ]);
  });

  it('answers the catalogs without periods to a denomination-wide session', async () => {
    const world = buildCashBookWorld();

    const options = await world.queries.options(
      contextFor(TENANT_A_WIDE, ['cash-transactions.write']),
    );

    expect(options).toMatchObject({
      congregationId: null,
      periods: [],
      congregationName: 'todas las sedes',
    });
    expect(options.funds.length).toBeGreaterThan(0);
  });

  it('does not show the periods of another sede', async () => {
    const world = buildCashBookWorld();

    const options = await world.queries.options(
      contextFor(TENANT_A_SIBLING, ['cash-transactions.write']),
    );

    expect(options.periods).toEqual([]);
  });
});

describe('CashBookQueryService.view', () => {
  it('computes the opening (balance of the year + previous months), totals and the running balance', async () => {
    const world = buildCashBookWorld();
    world.book.addLine(TENANT_A, {
      periodId: world.ids.october,
      accountId: world.ids.expense,
      fundId: world.ids.local,
      direction: 'OUT',
      postedOn: '2026-10-10',
      amount: 450_000,
      voucherType: 'CE',
    });
    line(world, 'IN', 1_000_000, '2026-11-01');
    line(world, 'OUT', 398_700.5, '2026-11-02');
    line(world, 'OUT', 100, '2026-11-02');

    const view = await world.queries.view(world.treasurer, query(world));

    expect(view.opening).toBe(18_000_000);
    expect(view.income).toBe(1_000_000);
    expect(view.expense).toBe(398_800.5);
    expect(view.closing).toBe(18_601_199.5);
    expect(view.rows.map((r) => r.balance)).toEqual([
      19_000_000, 18_601_299.5, 18_601_199.5,
    ]);
    expect(view.rows.at(-1)?.balance).toBe(view.closing);
    expect(view).toMatchObject({
      inCount: 1,
      outCount: 2,
      totalRows: 3,
      page: 1,
      pageSize: 15,
    });
    expect(view.period).toMatchObject({
      status: 'OPEN',
      label: 'Noviembre 2026',
    });
  });

  it('pages the lines keeping the true running balance, also when filtering', async () => {
    const world = buildCashBookWorld();
    line(world, 'IN', 1_000, '2026-11-01');
    line(world, 'OUT', 100, '2026-11-01', 'Papelería');
    line(world, 'OUT', 200, '2026-11-02', 'Servicio de agua');
    line(world, 'IN', 50, '2026-11-02');

    const secondPage = await world.queries.view(
      world.treasurer,
      query(world, { page: 2, pageSize: 2 }),
    );
    expect(secondPage.rows.map((r) => r.balance)).toEqual([
      18_450_700, 18_450_750,
    ]);
    expect(secondPage.totalRows).toBe(4);

    const expenses = await world.queries.view(
      world.treasurer,
      query(world, { direction: 'OUT' }),
    );
    expect(expenses.rows.map((r) => r.balance)).toEqual([
      18_450_900, 18_450_700,
    ]);
    expect(expenses.inCount).toBe(2);

    const search = await world.queries.view(
      world.treasurer,
      query(world, { search: 'agua' }),
    );
    expect(search.rows).toHaveLength(1);
    expect(search.rows[0].balance).toBe(18_450_700);
  });

  it('tells the reversal state of each line and why it cannot be reversed', async () => {
    const world = buildCashBookWorld();
    const original = line(world, 'OUT', 45_000, '2026-11-01', 'Papelería');
    await world.movements.reverse(world.treasurer, {
      transactionId: original.id,
      postedOn: TODAY,
      reason: 'Factura registrada dos veces',
    });
    world.book.addLine(TENANT_A, {
      periodId: world.ids.november,
      accountId: world.ids.tithes,
      fundId: world.ids.local,
      direction: 'IN',
      postedOn: '2026-11-02',
      amount: 90_000,
      voucherType: 'REC',
    });

    const view = await world.queries.view(world.treasurer, query(world));

    const byDescription = (text: string) =>
      view.rows.find((r) => r.description.includes(text))!;
    expect(view.rows.find((r) => r.id === original.id)).toMatchObject({
      status: 'REVERSED',
      reversalBlock: 'ALREADY_REVERSED',
      voucherCode: 'CE-2026-00001',
    });
    expect(byDescription('Reversa de')).toMatchObject({
      status: 'REVERSAL',
      reversalBlock: 'IS_REVERSAL',
      relatedVoucherCode: 'CE-2026-00001',
    });
    expect(
      view.rows.find((r) => r.reversalBlock === 'CONTRIBUTION'),
    ).toBeDefined();
  });

  it('reports the contributions of today still pending for the fund, the next vouchers and the open range', async () => {
    const world = buildCashBookWorld();
    world.book.addContribution(TENANT_A, {
      accountId: world.ids.tithes,
      amount: 90_000,
    });
    world.book.addContribution(TENANT_A, {
      accountId: world.ids.offerings,
      amount: 60_000,
    });
    world.book.addContribution(TENANT_A, {
      accountId: world.ids.missionsIncome,
      amount: 40_000,
    });
    line(world, 'OUT', 10, '2026-11-01');
    await world.movements.record(world.treasurer, {
      fundId: world.ids.local,
      direction: 'OUT',
      accountId: world.ids.expense,
      postedOn: TODAY,
      amount: 5,
      description: 'Pago de prueba',
    });

    const view = await world.queries.view(world.treasurer, query(world));

    expect(view.pendingToday).toEqual({
      date: TODAY,
      count: 2,
      amount: 150_000,
    });
    expect(view.nextCashOut).toBe('CE-2026-00002');
    expect(view.nextCashIn).toBe('CI-2026-00001');
    expect(view.openRange).toEqual({ min: '2026-11-01', max: TODAY });
  });

  it('explains why the period cannot be closed', async () => {
    const world = buildCashBookWorld();

    const view = await world.queries.view(world.treasurer, query(world));

    expect(view.closeBlockedReason).toContain('aún no termina');
  });

  it('answers 404 for a fund or a period it does not own', async () => {
    const world = buildCashBookWorld();
    const foreignFund = world.book.addFund(2, 'Fondo General');
    const siblingPeriod = world.book.addPeriod(TENANT_A_SIBLING, 2026, 11);

    expect(
      await codeOf(
        world.queries.view(
          world.treasurer,
          query(world, { fundId: foreignFund.id }),
        ),
      ),
    ).toBe('FUND_NOT_FOUND');
    expect(
      await codeOf(
        world.queries.view(
          world.treasurer,
          query(world, { periodId: siblingPeriod.id }),
        ),
      ),
    ).toBe('PERIOD_NOT_FOUND');
    expect(
      await codeOf(
        world.queries.view(
          contextFor(TENANT_A_SIBLING, ['cash-transactions.write']),
          query(world),
        ),
      ),
    ).toBe('PERIOD_NOT_FOUND');
  });

  it('does not exist for a denomination-wide session', async () => {
    const world = buildCashBookWorld();

    expect(
      await codeOf(
        world.queries.view(
          contextFor(TENANT_A_WIDE, ['cash-transactions.write']),
          query(world),
        ),
      ),
    ).toBe('CONGREGATION_SCOPE_REQUIRED');
  });
});
