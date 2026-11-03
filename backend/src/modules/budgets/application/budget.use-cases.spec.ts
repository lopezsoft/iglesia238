import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import {
  describeCrossTenantIsolation,
  expectNotFound,
} from '../../../../test/support/cross-tenant.js';
import { buildTenantContext } from '../../../../test/support/tenants.js';
import { DeleteBudgetLineUseCase } from './delete-budget-line.use-case.js';
import { GetBudgetLineDetailUseCase } from './get-budget-line-detail.use-case.js';
import { GetBudgetOverviewUseCase } from './get-budget-overview.use-case.js';
import {
  ChangeBudgetStatusUseCase,
  CopyBudgetUseCase,
  UpdateBudgetIncomeRateUseCase,
} from './manage-budget.use-cases.js';
import { SaveBudgetLineUseCase } from './save-budget-line.use-case.js';
import type { SaveBudgetLineCommand } from './budget.models.js';
import {
  FakeAudit,
  FakeClock,
  FakeTransactionRunner,
  InMemoryBudgets,
} from './testing/budget-fakes.js';

const PERMISSIONS = ['budgets.manage'];
const LOCAL = 1;
const MISSIONS = 2;
const YOUTH = 3;
const INACTIVE_FUND = 4;

function world() {
  const store = new InMemoryBudgets();
  store.congregations.set(10, { denominationId: 1, name: 'Sede Central' });
  store.congregations.set(11, { denominationId: 1, name: 'Sede Norte' });
  store.congregations.set(20, { denominationId: 2, name: 'Sede Vida' });
  store.funds = [
    { id: LOCAL, denominationId: 1, name: 'Fondo Local', isActive: true },
    {
      id: MISSIONS,
      denominationId: 1,
      name: 'Fondo de Misiones',
      isActive: true,
    },
    { id: YOUTH, denominationId: 1, name: 'Comité de Jóvenes', isActive: true },
    {
      id: INACTIVE_FUND,
      denominationId: 1,
      name: 'Campamento 2025',
      isActive: false,
    },
    { id: 50, denominationId: 2, name: 'Fondo Local', isActive: true },
  ];
  store.accounts = [
    {
      id: 1,
      denominationId: 1,
      code: '410505',
      name: 'Diezmos',
      nature: 'INCOME',
      isPostable: true,
      isActive: true,
    },
    {
      id: 2,
      denominationId: 1,
      code: '510505',
      name: 'Servicios públicos',
      nature: 'EXPENSE',
      isPostable: true,
      isActive: true,
    },
    {
      id: 3,
      denominationId: 1,
      code: '540510',
      name: 'Mantenimiento',
      nature: 'EXPENSE',
      isPostable: true,
      isActive: true,
    },
    {
      id: 4,
      denominationId: 1,
      code: '5105',
      name: 'Gastos',
      nature: 'EXPENSE',
      isPostable: false,
      isActive: true,
    },
    {
      id: 5,
      denominationId: 1,
      code: '550505',
      name: 'Eventos',
      nature: 'EXPENSE',
      isPostable: true,
      isActive: true,
    },
    {
      id: 60,
      denominationId: 2,
      code: '510505',
      name: 'Servicios',
      nature: 'EXPENSE',
      isPostable: true,
      isActive: true,
    },
  ];
  const clock = new FakeClock('2026-11-02');
  const audit = new FakeAudit();
  const runner = new FakeTransactionRunner();
  const treasurer = buildTenantContext({ permissions: PERMISSIONS });
  const contextOf = (scope: TenantScope) =>
    buildTenantContext({
      kind: 'CONGREGATION',
      denominationId: scope.denominationId,
      congregationId: scope.congregationId,
      permissions: PERMISSIONS,
    });
  return {
    store,
    audit,
    treasurer,
    contextOf,
    overview: new GetBudgetOverviewUseCase(store, clock),
    save: new SaveBudgetLineUseCase(store, store, runner, audit),
    remove: new DeleteBudgetLineUseCase(store, store, runner, audit),
    detail: new GetBudgetLineDetailUseCase(store),
    status: new ChangeBudgetStatusUseCase(store, store, runner, audit),
    rate: new UpdateBudgetIncomeRateUseCase(store, store, runner, audit),
    copy: new CopyBudgetUseCase(store, store, runner, audit),
  };
}

function line(
  overrides: Partial<SaveBudgetLineCommand> = {},
): SaveBudgetLineCommand {
  return {
    year: 2026,
    type: 'FIXED',
    accountId: 3,
    fundId: MISSIONS,
    annualAmount: 2_000_000,
    monthlyAmount: null,
    ...overrides,
  };
}

function spend(
  store: InMemoryBudgets,
  accountId: number,
  fundId: number,
  amount: number,
  postedOn = '2026-03-10',
  congregationId = 10,
) {
  const id = store.cash.length + 1;
  store.cash.push({
    id,
    denominationId: 1,
    congregationId,
    accountId,
    fundId,
    direction: 'OUT',
    amount,
    postedOn,
    description: `Gasto ${id}`,
    reversalOfId: null,
  });
  return id;
}

describe('GetBudgetOverviewUseCase', () => {
  it('computes the execution of each line from the cash book', async () => {
    const w = world();
    const saved = await w.save.execute(
      w.treasurer,
      null,
      line({ accountId: 2, fundId: LOCAL, annualAmount: 10_200_000 }),
      null,
    );
    spend(w.store, 2, LOCAL, 3_280_000);
    spend(w.store, 2, MISSIONS, 999);

    const { fixed, year, expectedPct } = await w.overview.execute(
      w.treasurer,
      null,
    );

    expect(year).toBe(2026);
    expect(expectedPct).toBe(83.3);
    expect(fixed.status).toBe('DRAFT');
    expect(fixed.lines.find((l) => l.id === saved.id)).toMatchObject({
      annualAmount: 10_200_000,
      executed: 3_280_000,
      executionPct: 32.2,
      overExecuted: false,
      difference: 6_920_000,
    });
    expect(fixed.totals.executed).toBe(3_280_000);
  });

  it('separates the totals of income and expense lines', async () => {
    const w = world();
    await w.save.execute(
      w.treasurer,
      null,
      line({ accountId: 1, fundId: LOCAL, annualAmount: 50_000_000 }),
      null,
    );
    await w.save.execute(
      w.treasurer,
      null,
      line({ accountId: 2, fundId: LOCAL, annualAmount: 10_000_000 }),
      null,
    );

    const { fixed } = await w.overview.execute(w.treasurer, 2026);

    expect(fixed.incomeTotals.annual).toBe(50_000_000);
    expect(fixed.expenseTotals.annual).toBe(10_000_000);
    expect(fixed.totals.annual).toBe(60_000_000);
  });

  it('groups committee lines and marks concepts shared between committees', async () => {
    const w = world();
    await w.save.execute(
      w.treasurer,
      null,
      line({
        type: 'COMMITTEE',
        accountId: 5,
        fundId: YOUTH,
        annualAmount: 800_000,
      }),
      null,
    );
    await w.save.execute(
      w.treasurer,
      null,
      line({
        type: 'COMMITTEE',
        accountId: 5,
        fundId: MISSIONS,
        annualAmount: 500_000,
      }),
      null,
    );
    spend(w.store, 5, YOUTH, 380_000);

    const { committee } = await w.overview.execute(w.treasurer, 2026);

    expect(committee.groups.map((g) => g.fundName)).toEqual([
      'Comité de Jóvenes',
      'Fondo de Misiones',
    ]);
    const youth = committee.lines.find((l) => l.fundId === YOUTH)!;
    expect(youth.sharedWith).toEqual(['Fondo de Misiones']);
    expect(youth.executed).toBe(380_000);
    expect(committee.groups[0].totals.annual).toBe(800_000);
  });

  it('leaves reversed movements out of the execution', async () => {
    const w = world();
    const saved = await w.save.execute(w.treasurer, null, line(), null);
    const labour = spend(w.store, 3, MISSIONS, 2_800_000);
    expect(
      (await w.overview.execute(w.treasurer, 2026)).fixed.lines[0],
    ).toMatchObject({ executed: 2_800_000, overExecuted: true });

    w.store.cash.push({
      id: 99,
      denominationId: 1,
      congregationId: 10,
      accountId: 3,
      fundId: MISSIONS,
      direction: 'IN',
      amount: 2_800_000,
      postedOn: '2026-11-02',
      description: 'Reversa',
      reversalOfId: labour,
    });

    const after = await w.overview.execute(w.treasurer, 2026);
    expect(after.fixed.lines.find((l) => l.id === saved.id)).toMatchObject({
      executed: 0,
      overExecuted: false,
    });
  });

  it('lists years, accounts and funds, and answers empty views for a new year', async () => {
    const w = world();
    await w.save.execute(w.treasurer, null, line({ year: 2024 }), null);

    const result = await w.overview.execute(w.treasurer, 2027);

    expect(result.years).toEqual([2027, 2026, 2024]);
    expect(result.fixed).toMatchObject({
      budgetId: null,
      status: null,
      lines: [],
    });
    expect(result.accounts.map((a) => a.label)).toContain('410505 · Diezmos');
    expect(result.accounts.some((a) => a.id === 4)).toBe(false);
    expect(result.funds.some((f) => f.id === INACTIVE_FUND)).toBe(false);
    expect(result.expectedPct).toBe(0);
  });

  it('answers the denomination-wide overview without budgets but with the catalogs', async () => {
    const w = world();

    const result = await w.overview.execute(
      buildTenantContext({ kind: 'DENOMINATION', permissions: PERMISSIONS }),
      null,
    );

    expect(result.congregationScoped).toBe(false);
    expect(result.fixed.lines).toEqual([]);
    expect(result.accounts.length).toBeGreaterThan(0);
  });

  it('rejects an invalid year', async () => {
    const w = world();

    await expect(w.overview.execute(w.treasurer, 1999)).rejects.toMatchObject({
      code: 'INVALID_YEAR',
    });
  });
});

describe('SaveBudgetLineUseCase', () => {
  it('validates the amounts, the account, the fund and duplicates', async () => {
    const w = world();
    await w.save.execute(
      w.treasurer,
      null,
      line({ accountId: 2, fundId: LOCAL }),
      null,
    );

    await expect(
      w.save.execute(w.treasurer, null, line({ annualAmount: 0 }), null),
    ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    await expect(
      w.save.execute(
        w.treasurer,
        null,
        line({ monthlyAmount: 3_000_000 }),
        null,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_MONTHLY_AMOUNT' });
    await expect(
      w.save.execute(w.treasurer, null, line({ year: 1990 }), null),
    ).rejects.toMatchObject({ code: 'INVALID_YEAR' });
    await expect(
      w.save.execute(w.treasurer, null, line({ accountId: 4 }), null),
    ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_POSTABLE' });
    await expect(
      w.save.execute(w.treasurer, null, line({ accountId: 60 }), null),
    ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_POSTABLE' });
    await expect(
      w.save.execute(w.treasurer, null, line({ fundId: INACTIVE_FUND }), null),
    ).rejects.toMatchObject({ code: 'FUND_INACTIVE' });
    await expect(
      w.save.execute(w.treasurer, null, line({ fundId: 50 }), null),
    ).rejects.toMatchObject({ code: 'FUND_INACTIVE' });
    await expect(
      w.save.execute(
        w.treasurer,
        null,
        line({ accountId: 2, fundId: LOCAL }),
        null,
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_BUDGET_LINE' });
  });

  it('allows the same concept in another committee and audits the creation', async () => {
    const w = world();
    await w.save.execute(
      w.treasurer,
      null,
      line({ type: 'COMMITTEE', accountId: 5, fundId: YOUTH }),
      null,
    );

    const shared = await w.save.execute(
      w.treasurer,
      null,
      line({ type: 'COMMITTEE', accountId: 5, fundId: MISSIONS }),
      '10.0.0.8',
    );

    expect(shared.sharedWith).toEqual(['Comité de Jóvenes']);
    expect(w.audit.entries.at(-1)).toMatchObject({
      action: 'BUDGET_LINE_CREATED',
      entity: 'BudgetLine',
      ipAddress: '10.0.0.8',
    });
  });

  it('edits a line and refuses to make it a duplicate', async () => {
    const w = world();
    const utilities = await w.save.execute(
      w.treasurer,
      null,
      line({ accountId: 2, fundId: LOCAL, annualAmount: 10_200_000 }),
      null,
    );
    const fees = await w.save.execute(
      w.treasurer,
      null,
      line({ accountId: 3, fundId: LOCAL }),
      null,
    );

    const edited = await w.save.execute(
      w.treasurer,
      utilities.id,
      line({
        accountId: 2,
        fundId: LOCAL,
        annualAmount: 12_000_000,
        monthlyAmount: 1_000_000,
      }),
      null,
    );

    expect(edited).toMatchObject({
      id: utilities.id,
      annualAmount: 12_000_000,
      monthlyAmount: 1_000_000,
    });
    expect(w.audit.entries.at(-1)).toMatchObject({
      action: 'BUDGET_LINE_UPDATED',
    });
    await expect(
      w.save.execute(
        w.treasurer,
        fees.id,
        line({ accountId: 2, fundId: LOCAL }),
        null,
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_BUDGET_LINE' });
    await expect(
      w.save.execute(
        w.treasurer,
        utilities.id,
        line({ year: 2025, accountId: 2, fundId: LOCAL }),
        null,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('creates the budget of a new year as a draft with its first line', async () => {
    const w = world();

    const first = await w.save.execute(
      w.treasurer,
      null,
      line({ year: 2027 }),
      null,
    );

    const after = await w.overview.execute(w.treasurer, 2027);
    expect(after.fixed.status).toBe('DRAFT');
    expect(after.fixed.lines).toHaveLength(1);
    expect(after.fixed.lines[0]).toMatchObject({ id: first.id, executed: 0 });
  });

  it('is read-only once the budget is closed', async () => {
    const w = world();
    const saved = await w.save.execute(w.treasurer, null, line(), null);
    await w.status.execute(w.treasurer, saved.budgetId, 'APPROVED', null);
    await w.status.execute(w.treasurer, saved.budgetId, 'CLOSED', null);

    await expect(
      w.save.execute(w.treasurer, null, line({ accountId: 2 }), null),
    ).rejects.toMatchObject({ code: 'BUDGET_CLOSED' });
    await expect(
      w.save.execute(w.treasurer, saved.id, line(), null),
    ).rejects.toMatchObject({ code: 'BUDGET_CLOSED' });
    await expect(
      w.remove.execute(w.treasurer, saved.id, null),
    ).rejects.toMatchObject({ code: 'BUDGET_CLOSED' });
  });

  it('needs a sede', async () => {
    const w = world();
    const wide = buildTenantContext({
      kind: 'DENOMINATION',
      permissions: PERMISSIONS,
    });

    await expect(
      w.save.execute(wide, null, line(), null),
    ).rejects.toMatchObject({ code: 'CONGREGATION_SCOPE_REQUIRED' });
  });

  describeCrossTenantIsolation('SaveBudgetLineUseCase (edit)', {
    arrange: async (owner: TenantScope) => {
      shared = world();
      return (
        await shared.save.execute(
          shared.contextOf(owner),
          null,
          line({ accountId: 2, fundId: LOCAL }),
          null,
        )
      ).id;
    },
    act: (scope: TenantScope, id) =>
      shared!.save.execute(
        shared!.contextOf(scope),
        id,
        line({ accountId: 2, fundId: LOCAL, annualAmount: 1 }),
        null,
      ),
  });
});

describe('DeleteBudgetLineUseCase', () => {
  it('deletes a line, keeps the cash movements and audits', async () => {
    const w = world();
    const saved = await w.save.execute(w.treasurer, null, line(), null);
    spend(w.store, 3, MISSIONS, 100);

    await w.remove.execute(w.treasurer, saved.id, null);

    expect(w.store.lines).toHaveLength(0);
    expect(w.store.cash).toHaveLength(1);
    expect(w.audit.entries.at(-1)).toMatchObject({
      action: 'BUDGET_LINE_DELETED',
      entity: 'BudgetLine',
    });
  });

  describeCrossTenantIsolation('DeleteBudgetLineUseCase', {
    arrange: async (owner: TenantScope) => {
      shared = world();
      return (
        await shared.save.execute(shared.contextOf(owner), null, line(), null)
      ).id;
    },
    act: (scope: TenantScope, id) =>
      shared!.remove.execute(shared!.contextOf(scope), id, null),
  });
});

describe('ChangeBudgetStatusUseCase', () => {
  it('approves, reopens and closes in order', async () => {
    const w = world();
    const saved = await w.save.execute(w.treasurer, null, line(), null);

    expect(
      (await w.status.execute(w.treasurer, saved.budgetId, 'APPROVED', null))
        .status,
    ).toBe('APPROVED');
    expect(
      (await w.status.execute(w.treasurer, saved.budgetId, 'DRAFT', null))
        .status,
    ).toBe('DRAFT');
    await w.status.execute(w.treasurer, saved.budgetId, 'APPROVED', null);
    expect(
      (await w.status.execute(w.treasurer, saved.budgetId, 'CLOSED', null))
        .status,
    ).toBe('CLOSED');
    expect(w.audit.entries.map((e) => e.action).slice(-4)).toEqual([
      'BUDGET_APPROVED',
      'BUDGET_REOPENED',
      'BUDGET_APPROVED',
      'BUDGET_CLOSED',
    ]);
    await expect(
      w.status.execute(w.treasurer, saved.budgetId, 'DRAFT', null),
    ).rejects.toMatchObject({ code: 'BUDGET_CLOSED' });
  });

  it('refuses invalid transitions and approving an empty budget', async () => {
    const w = world();
    const saved = await w.save.execute(w.treasurer, null, line(), null);

    await expect(
      w.status.execute(w.treasurer, saved.budgetId, 'CLOSED', null),
    ).rejects.toMatchObject({ code: 'BUDGET_STATUS_INVALID' });
    await w.remove.execute(w.treasurer, saved.id, null);
    await expect(
      w.status.execute(w.treasurer, saved.budgetId, 'APPROVED', null),
    ).rejects.toMatchObject({ code: 'BUDGET_EMPTY' });
  });

  describeCrossTenantIsolation('ChangeBudgetStatusUseCase', {
    arrange: async (owner: TenantScope) => {
      shared = world();
      return (
        await shared.save.execute(shared.contextOf(owner), null, line(), null)
      ).budgetId;
    },
    act: (scope: TenantScope, id) =>
      shared!.status.execute(shared!.contextOf(scope), id, 'APPROVED', null),
  });
});

describe('UpdateBudgetIncomeRateUseCase', () => {
  it('stores and clears the expected income increase and validates the range', async () => {
    const w = world();
    const saved = await w.save.execute(w.treasurer, null, line(), null);

    expect(
      (await w.rate.execute(w.treasurer, saved.budgetId, 0.05, null))
        .incomeIncreaseRate,
    ).toBe(0.05);
    expect(
      (await w.rate.execute(w.treasurer, saved.budgetId, null, null))
        .incomeIncreaseRate,
    ).toBeNull();
    await expect(
      w.rate.execute(w.treasurer, saved.budgetId, 1.5, null),
    ).rejects.toMatchObject({ code: 'INVALID_RATE' });
    await expect(
      w.rate.execute(w.treasurer, saved.budgetId, 0.12345, null),
    ).rejects.toMatchObject({ code: 'INVALID_RATE' });
  });

  it('answers 404 for the budget of another sede', async () => {
    const w = world();
    const saved = await w.save.execute(
      w.contextOf(TenantScope.of(1, 10)),
      null,
      line(),
      null,
    );

    await expectNotFound(
      w.rate.execute(
        w.contextOf(TenantScope.of(1, 11)),
        saved.budgetId,
        0.1,
        null,
      ),
    );
    await expectNotFound(
      w.rate.execute(
        w.contextOf(TenantScope.of(2, 20)),
        saved.budgetId,
        0.1,
        null,
      ),
    );
  });
});

describe('CopyBudgetUseCase', () => {
  it('copies the lines of another year as a draft, adjusted, skipping what already exists', async () => {
    const w = world();
    await w.save.execute(
      w.treasurer,
      null,
      line({
        year: 2025,
        accountId: 2,
        fundId: LOCAL,
        annualAmount: 1_000_000,
        monthlyAmount: 80_000,
      }),
      null,
    );
    await w.save.execute(
      w.treasurer,
      null,
      line({ year: 2025, accountId: 3, fundId: LOCAL, annualAmount: 500_000 }),
      null,
    );
    await w.save.execute(
      w.treasurer,
      null,
      line({ year: 2026, accountId: 3, fundId: LOCAL, annualAmount: 1 }),
      null,
    );

    const result = await w.copy.execute(
      w.treasurer,
      {
        type: 'FIXED',
        sourceYear: 2025,
        targetYear: 2026,
        adjustmentRate: 0.1,
      },
      null,
    );

    expect(result).toMatchObject({ copied: 1, skipped: 1 });
    const copied = (
      await w.overview.execute(w.treasurer, 2026)
    ).fixed.lines.find((l) => l.accountId === 2)!;
    expect(copied).toMatchObject({
      annualAmount: 1_100_000,
      monthlyAmount: 88_000,
    });
    expect(w.audit.entries.at(-1)).toMatchObject({ action: 'BUDGET_COPIED' });
  });

  it('creates the target budget as a draft and refuses an empty source or a closed target', async () => {
    const w = world();
    await expect(
      w.copy.execute(
        w.treasurer,
        {
          type: 'FIXED',
          sourceYear: 2024,
          targetYear: 2026,
          adjustmentRate: null,
        },
        null,
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_BUDGET_NOT_FOUND' });
    await expect(
      w.copy.execute(
        w.treasurer,
        {
          type: 'FIXED',
          sourceYear: 2026,
          targetYear: 2026,
          adjustmentRate: null,
        },
        null,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_YEAR' });

    await w.save.execute(w.treasurer, null, line({ year: 2025 }), null);
    const target = await w.save.execute(
      w.treasurer,
      null,
      line({ year: 2026, accountId: 2, fundId: LOCAL }),
      null,
    );
    await w.status.execute(w.treasurer, target.budgetId, 'APPROVED', null);
    await w.status.execute(w.treasurer, target.budgetId, 'CLOSED', null);
    await expect(
      w.copy.execute(
        w.treasurer,
        {
          type: 'FIXED',
          sourceYear: 2025,
          targetYear: 2026,
          adjustmentRate: null,
        },
        null,
      ),
    ).rejects.toMatchObject({ code: 'BUDGET_CLOSED' });

    const fresh = await w.copy.execute(
      w.treasurer,
      {
        type: 'FIXED',
        sourceYear: 2025,
        targetYear: 2028,
        adjustmentRate: null,
      },
      null,
    );
    expect(fresh.copied).toBe(1);
    expect((await w.overview.execute(w.treasurer, 2028)).fixed.status).toBe(
      'DRAFT',
    );
  });

  it('does not read the budget of another sede', async () => {
    const w = world();
    await w.save.execute(
      w.contextOf(TenantScope.of(1, 11)),
      null,
      line({ year: 2025 }),
      null,
    );

    await expect(
      w.copy.execute(
        w.treasurer,
        {
          type: 'FIXED',
          sourceYear: 2025,
          targetYear: 2026,
          adjustmentRate: null,
        },
        null,
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_BUDGET_NOT_FOUND' });
  });
});

describe('GetBudgetLineDetailUseCase', () => {
  it('shows the month by month execution and the latest movements', async () => {
    const w = world();
    const saved = await w.save.execute(
      w.treasurer,
      null,
      line({ annualAmount: 1_200_000 }),
      null,
    );
    spend(w.store, 3, MISSIONS, 100_000, '2026-01-10');
    spend(w.store, 3, MISSIONS, 50_000, '2026-01-20');
    spend(w.store, 3, MISSIONS, 70_000, '2026-03-02');

    const result = await w.detail.execute(w.treasurer, saved.id);

    expect(result.line).toMatchObject({ executed: 220_000 });
    expect(result.months[0]).toEqual({
      month: 1,
      planned: 100_000,
      executed: 150_000,
    });
    expect(result.movements.map((m) => m.postedOn)).toEqual([
      '2026-03-02',
      '2026-01-20',
      '2026-01-10',
    ]);
    expect(result).toMatchObject({
      year: 2026,
      type: 'FIXED',
      status: 'DRAFT',
    });
  });

  describeCrossTenantIsolation('GetBudgetLineDetailUseCase', {
    arrange: async (owner: TenantScope) => {
      shared = world();
      return (
        await shared.save.execute(shared.contextOf(owner), null, line(), null)
      ).id;
    },
    act: (scope: TenantScope, id) =>
      shared!.detail.execute(shared!.contextOf(scope), id),
  });
});

// The cross-tenant helper arranges and acts in separate callbacks; they share one world per test.
let shared: ReturnType<typeof world> | undefined;
