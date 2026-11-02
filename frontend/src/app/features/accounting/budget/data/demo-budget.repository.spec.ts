import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../../core/auth/demo-auth.gateway';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { DomainError } from '../../../../core/errors/domain-error';
import { DEMO_FUNDS } from '../../data/accounting-demo-seed';
import { AccountingDemoStore } from '../../data/accounting-demo-store';
import { CashTransaction } from '../../data/accounting.models';
import { budgetTotals, executedAmount, executionPct, expectedExecutionPct } from './budget-execution';
import { SaveBudgetLineCommand } from './budget.models';
import { BudgetRepository } from './budget.repository';
import { DemoBudgetRepository } from './demo-budget.repository';

const TREASURER = 'jorge.ramirez@montedesion.example';
const PASTOR = 'daniel.herrera@montedesion.example';
const SOACHA_TREASURER = 'paola.ruiz@montedesion.example';

async function setup(email: string, congregationId?: number) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: DemoAuthGateway },
      { provide: BudgetRepository, useClass: DemoBudgetRepository },
    ],
  });
  const auth = TestBed.inject(AuthService);
  const user = await firstValueFrom(auth.login(email, DEMO_PASSWORD));
  if (congregationId !== undefined) {
    auth.selectScope(user.selectableScopes.find((scope) => scope.congregationId === congregationId)!);
  }
  return {
    repo: TestBed.inject(BudgetRepository),
    store: TestBed.inject(AccountingDemoStore),
    db: TestBed.inject(DemoDatabase),
  };
}

async function errorOf(source: Observable<unknown>): Promise<DomainError> {
  const error = await firstValueFrom(source).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

function accountId(store: AccountingDemoStore, code: string): number {
  return store.accounts.find((a) => a.denominationId === 1 && a.code === code)!.id;
}

function line(store: AccountingDemoStore, overrides: Partial<SaveBudgetLineCommand> = {}): SaveBudgetLineCommand {
  return {
    id: null,
    year: 2026,
    type: 'FIXED',
    accountId: accountId(store, '540510'),
    fundId: DEMO_FUNDS.building,
    annualAmount: 2_000_000,
    monthlyAmount: null,
    ...overrides,
  };
}

function tx(overrides: Partial<CashTransaction>): CashTransaction {
  return {
    id: 1,
    denominationId: 1,
    congregationId: 1,
    periodId: 1,
    accountId: 10,
    fundId: 1,
    voucherId: null,
    direction: 'OUT',
    postedOn: '2026-03-10',
    amount: 100,
    description: 'Prueba',
    reversalOfId: null,
    createdById: 5,
    createdAt: '2026-03-10T00:00:00Z',
    ...overrides,
  };
}

describe('budget execution rules', () => {
  it('sums the year movements of the account and fund, leaving out reversed pairs', () => {
    const rows = [
      tx({ id: 1, amount: 300 }),
      tx({ id: 2, amount: 200 }),
      tx({ id: 3, amount: 200, direction: 'IN', reversalOfId: 2 }),
      tx({ id: 4, amount: 50, direction: 'IN' }),
      tx({ id: 5, amount: 999, postedOn: '2025-12-31' }),
      tx({ id: 6, amount: 999, fundId: 2 }),
      tx({ id: 7, amount: 999, congregationId: 2 }),
    ];
    const key = { congregationId: 1, accountId: 10, fundId: 1, year: 2026, nature: 'EXPENSE' as const };
    expect(executedAmount(rows, key)).toBe(250);
    expect(executedAmount(rows, { ...key, nature: 'INCOME' })).toBe(-250);
  });

  it('computes percentages, totals and the expected execution at a date', () => {
    expect(executionPct(4_200_000, 3_000_000)).toBe(140);
    expect(executionPct(10, 0)).toBe(0);
    expect(budgetTotals([
      { annualAmount: 1_000, monthlyAmount: 100, executed: 500 },
      { annualAmount: 500, monthlyAmount: null, executed: 700 },
    ])).toEqual({ annual: 1_500, monthly: 100, executed: 1_200, executionPct: 80, difference: 300 });
    expect(expectedExecutionPct(2026, '2026-11-02')).toBe(83.3);
    expect(expectedExecutionPct(2025, '2026-11-02')).toBe(100);
    expect(expectedExecutionPct(2027, '2026-11-02')).toBe(0);
  });
});

describe('DemoBudgetRepository', () => {
  it('computes the execution of each line from the cash book', async () => {
    const { repo } = await setup(TREASURER);
    const overview = await firstValueFrom(repo.overview(null));

    expect(overview.year).toBe(2026);
    expect(overview.fixed.status).toBe('APPROVED');
    const utilities = overview.fixed.lines.find((l) => l.accountCode === '510505' && l.fundId === DEMO_FUNDS.local)!;
    expect(utilities).toMatchObject({ annualAmount: 10_200_000, executed: 3_280_000, executionPct: 32.2, overExecuted: false, difference: 6_920_000 });
    expect(overview.fixed.totals.annual).toBe(overview.fixed.lines.reduce((sum, l) => sum + l.annualAmount, 0));
    expect(overview.fixed.totals.executed).toBe(overview.fixed.lines.reduce((sum, l) => sum + l.executed, 0));
  });

  it('groups committee lines by committee and marks concepts shared between committees', async () => {
    const { repo } = await setup(TREASURER);
    const { committee } = await firstValueFrom(repo.overview(2026));

    expect(committee.groups.map((g) => g.fundName)).toEqual(['Comité de Damas', 'Comité de Jóvenes', 'Fondo de Misiones']);
    for (const group of committee.groups) {
      expect(group.totals.annual).toBe(group.lines.reduce((sum, l) => sum + l.annualAmount, 0));
    }
    const events = committee.lines.find((l) => l.accountCode === '550505' && l.fundId === DEMO_FUNDS.women)!;
    expect(events.sharedWith).toEqual(['Comité de Jóvenes', 'Fondo de Misiones']);
    expect(events.executed).toBe(380_000);
  });

  it('flags over-execution and leaves reversed movements out', async () => {
    const { repo, store } = await setup(TREASURER);
    const saved = await firstValueFrom(repo.saveLine(line(store)));
    expect(saved).toMatchObject({ executed: 2_800_000, executionPct: 140, overExecuted: true, difference: -800_000 });

    const labour = store.cashTransactions.find((t) => t.congregationId === 1 && t.description.startsWith('Mano de obra'))!;
    store.reverseCashTransaction({ transactionId: labour.id, postedOn: '2026-11-02', createdById: 5, description: 'Reversa' });
    const overview = await firstValueFrom(repo.overview(2026));
    expect(overview.fixed.lines.find((l) => l.id === saved.id)).toMatchObject({ executed: 0, overExecuted: false });
  });

  it('validates the amount, the account and duplicates of account + fund in the same budget', async () => {
    const { repo, store, db } = await setup(TREASURER);
    const group = store.accounts.find((a) => a.denominationId === 1 && a.code === '5105')!;

    expect((await errorOf(repo.saveLine(line(store, { annualAmount: 0 })))).code).toBe('INVALID_AMOUNT');
    expect((await errorOf(repo.saveLine(line(store, { monthlyAmount: 3_000_000 })))).code).toBe('INVALID_MONTHLY_AMOUNT');
    expect((await errorOf(repo.saveLine(line(store, { accountId: group.id })))).code).toBe('ACCOUNT_NOT_POSTABLE');
    expect((await errorOf(repo.saveLine(line(store, { fundId: DEMO_FUNDS.camp2025 })))).code).toBe('FUND_INACTIVE');
    expect(
      (await errorOf(repo.saveLine(line(store, { accountId: accountId(store, '510505'), fundId: DEMO_FUNDS.local })))).code,
    ).toBe('DUPLICATE_BUDGET_LINE');
    expect(
      (await errorOf(repo.saveLine(line(store, { type: 'COMMITTEE', accountId: accountId(store, '550505'), fundId: DEMO_FUNDS.youth })))).code,
    ).toBe('DUPLICATE_BUDGET_LINE');

    // The same concept in another committee is a different line.
    const shared = await firstValueFrom(
      repo.saveLine(line(store, { type: 'COMMITTEE', accountId: accountId(store, '550510'), fundId: DEMO_FUNDS.missions })),
    );
    expect(shared.sharedWith).toEqual(['Comité de Damas', 'Comité de Jóvenes']);
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'BUDGET_LINE_CREATED', entity: 'BudgetLine' });
  });

  it('edits and deletes lines, refusing duplicates and closed budgets', async () => {
    const { repo, store } = await setup(TREASURER);
    const { fixed } = await firstValueFrom(repo.overview(2026));
    const utilities = fixed.lines.find((l) => l.accountCode === '510505')!;
    const fees = fixed.lines.find((l) => l.accountCode === '510510')!;

    const edited = await firstValueFrom(
      repo.saveLine(line(store, { id: utilities.id, accountId: utilities.accountId, fundId: utilities.fundId, annualAmount: 12_000_000, monthlyAmount: 1_000_000 })),
    );
    expect(edited).toMatchObject({ id: utilities.id, annualAmount: 12_000_000, monthlyAmount: 1_000_000 });
    expect(
      (await errorOf(repo.saveLine(line(store, { id: fees.id, accountId: utilities.accountId, fundId: utilities.fundId })))).code,
    ).toBe('DUPLICATE_BUDGET_LINE');

    await firstValueFrom(repo.deleteLine(fees.id));
    expect(store.budgetLines.some((l) => l.id === fees.id)).toBe(false);

    const budget = store.budgets.find((b) => b.id === utilities.budgetId)!;
    store.replace(store.budgets, { ...budget, status: 'CLOSED' });
    expect((await errorOf(repo.deleteLine(utilities.id))).code).toBe('BUDGET_CLOSED');
    expect((await errorOf(repo.saveLine(line(store)))).code).toBe('BUDGET_CLOSED');
  });

  it('creates the budget of a new year as a draft with its first line', async () => {
    const { repo, store } = await setup(TREASURER);
    const before = await firstValueFrom(repo.overview(2027));
    expect(before.fixed).toMatchObject({ budgetId: null, status: null, lines: [] });

    await firstValueFrom(repo.saveLine(line(store, { year: 2027 })));
    const after = await firstValueFrom(repo.overview(2027));
    expect(after.fixed.status).toBe('DRAFT');
    expect(after.fixed.lines).toHaveLength(1);
    expect(after.fixed.lines[0].executed).toBe(0);
    expect(after.expectedPct).toBe(0);
  });

  it('requires budgets.manage', async () => {
    const { repo, store } = await setup(PASTOR);
    expect((await errorOf(repo.overview(2026))).code).toBe('FORBIDDEN');
    expect((await errorOf(repo.saveLine(line(store)))).code).toBe('FORBIDDEN');
    expect((await errorOf(repo.deleteLine(1))).code).toBe('FORBIDDEN');
  });

  it('isolates sedes: the Soacha treasurer never sees nor changes Sede Central lines', async () => {
    const { repo, store } = await setup(SOACHA_TREASURER, 3);
    const overview = await firstValueFrom(repo.overview(2026));
    expect(overview.congregationName).toBe('Sede Soacha');
    expect(overview.fixed.lines).toEqual([]);
    expect(overview.committee.lines).toEqual([]);
    expect((await errorOf(repo.deleteLine(1))).code).toBe('NOT_FOUND');
    expect((await errorOf(repo.saveLine(line(store, { id: 1 })))).code).toBe('NOT_FOUND');
  });
});
