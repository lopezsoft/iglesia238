import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../core/auth/auth.gateway';
import { AuthService } from '../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../core/auth/demo-auth.gateway';
import { DemoDatabase } from '../../../core/demo/demo-database';
import { DEMO_PASSWORD } from '../../../core/demo/demo-fixtures';
import { DomainError } from '../../../core/errors/domain-error';
import { DEMO_FUNDS } from '../../accounting/data/accounting-demo-seed';
import { AccountingDemoStore } from '../../accounting/data/accounting-demo-store';
import { DemoReportsRepository } from './demo-reports.repository';
import { ReportQuery } from './reports.models';
import { ReportsRepository } from './reports.repository';

const DENOMINATION_ADMIN = 'andres.molina@montedesion.example';
const PASTOR_CENTRAL = 'daniel.herrera@montedesion.example';
const SECRETARY_CENTRAL = 'marta.castillo@montedesion.example';
const TREASURER_CENTRAL = 'jorge.ramirez@montedesion.example';
const PASTOR_NORTE = 'luis.ortega@montedesion.example';
const ADMIN_DENOMINATION_2 = 'ricardo.leon@vidanueva.example';

const OCTOBER: ReportQuery = { from: '2026-10-01', to: '2026-10-31', fundId: null };

async function signIn(
  email: string,
): Promise<{ repository: ReportsRepository; store: AccountingDemoStore; auth: AuthService }> {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: DemoAuthGateway },
      { provide: ReportsRepository, useClass: DemoReportsRepository },
    ],
  });
  const auth = TestBed.inject(AuthService);
  await firstValueFrom(auth.login(email, DEMO_PASSWORD));
  return {
    repository: TestBed.inject(ReportsRepository),
    store: TestBed.inject(AccountingDemoStore),
    auth,
  };
}

async function failure(promise: Promise<unknown>): Promise<DomainError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

/** Income and expense straight from the store, by account nature (reversals net out). */
function expectedTotals(
  store: AccountingDemoStore,
  sedeIds: readonly number[],
  from: string,
  to: string,
) {
  let income = 0;
  let expense = 0;
  for (const tx of store.cashTransactions) {
    if (!sedeIds.includes(tx.congregationId) || tx.postedOn < from || tx.postedOn > to) {
      continue;
    }
    const nature = store.accounts.find((a) => a.id === tx.accountId)!.nature;
    if (nature === 'INCOME') {
      income += tx.direction === 'IN' ? tx.amount : -tx.amount;
    } else {
      expense += tx.direction === 'OUT' ? tx.amount : -tx.amount;
    }
  }
  return { income, expense, balance: income - expense };
}

describe('DemoReportsRepository', () => {
  it('matches the cash book of the sede for a known range', async () => {
    const { repository, store } = await signIn(PASTOR_CENTRAL);
    const report = await firstValueFrom(repository.financialReport(OCTOBER));

    const expected = expectedTotals(store, [1], OCTOBER.from, OCTOBER.to);
    expect(report.totals).toEqual(expected);
    const cashIn = store.cashTransactions
      .filter((tx) => tx.congregationId === 1 && tx.postedOn.startsWith('2026-10-'))
      .reduce((sum, tx) => sum + (tx.direction === 'IN' ? tx.amount : -tx.amount), 0);
    expect(report.totals.balance).toBe(cashIn);

    expect(report.months).toHaveLength(1);
    expect(report.months[0]).toMatchObject({
      label: 'Octubre 2026',
      periodStatus: 'CLOSED',
      ...expected,
    });
    expect(report.congregations).toBeNull();
  });

  it('adds contributions by type from the recorded contributions only', async () => {
    const { repository, store } = await signIn(PASTOR_CENTRAL);
    const report = await firstValueFrom(repository.financialReport(OCTOBER));

    const recorded = store.contributions.filter(
      (c) =>
        c.congregationId === 1 && c.status === 'RECORDED' && c.receivedOn.startsWith('2026-10-'),
    );
    expect(report.contributionsCount).toBe(recorded.length);
    expect(report.contributionsTotal).toBe(recorded.reduce((sum, c) => sum + c.amount, 0));
    expect(report.contributionTypes.reduce((sum, t) => sum + t.share, 0)).toBeCloseTo(1, 6);
    // October has interest income (421010) that is not a contribution.
    expect(report.otherIncome).toBe(18_500);
  });

  it('keeps the fund table consistent: closing = opening + inflows − outflows', async () => {
    const { repository } = await signIn(TREASURER_CENTRAL);
    const report = await firstValueFrom(
      repository.financialReport({ from: '2026-01-01', to: '2026-12-31', fundId: null }),
    );

    expect(report.months).toHaveLength(12);
    const inflows = report.funds.reduce((sum, f) => sum + f.inflows, 0);
    const outflows = report.funds.reduce((sum, f) => sum + f.outflows, 0);
    expect(inflows - outflows).toBe(report.totals.balance);
    for (const fund of report.funds) {
      expect(fund.closing).toBe(fund.opening + fund.inflows - fund.outflows);
    }
    expect(report.funds.find((f) => f.fundId === DEMO_FUNDS.local)?.opening).toBe(18_450_000);
  });

  it('filters by fund and compares with the previous period of the same length', async () => {
    const { repository } = await signIn(PASTOR_CENTRAL);
    const report = await firstValueFrom(
      repository.financialReport({ ...OCTOBER, fundId: DEMO_FUNDS.missions }),
    );

    expect(report.fundLabel).toBe('Fondo de Misiones');
    expect(report.funds.map((f) => f.fundId)).toEqual([DEMO_FUNDS.missions]);
    expect(report.previous.to).toBe('2026-09-30');
    expect(report.previous.from).toBe('2026-08-31');
  });

  it('breaks a denomination-wide report down per sede', async () => {
    const { repository, store } = await signIn(DENOMINATION_ADMIN);
    const report = await firstValueFrom(repository.financialReport(OCTOBER));

    expect(report.congregations?.map((c) => c.name)).toEqual([
      'Sede Central',
      'Sede Norte',
      'Sede Soacha',
    ]);
    expect(report.totals).toEqual(expectedTotals(store, [1, 2, 3], OCTOBER.from, OCTOBER.to));
    const income = report.congregations!.reduce((sum, c) => sum + c.income, 0);
    expect(income).toBe(report.totals.income);
  });

  it('keeps a deactivated sede in every table of a denomination-wide report', async () => {
    const { repository } = await signIn(DENOMINATION_ADMIN);
    const fullYear: ReportQuery = { from: '2026-01-01', to: '2026-12-31', fundId: null };
    const before = await firstValueFrom(repository.financialReport(fullYear));

    const db = TestBed.inject(DemoDatabase);
    db.replace(db.congregations, { ...db.congregation(3)!, isActive: false });
    const after = await firstValueFrom(repository.financialReport(fullYear));

    expect(after.congregations?.map((c) => c.name)).toEqual([
      'Sede Central',
      'Sede Norte',
      'Sede Soacha (inactiva)',
    ]);
    expect(after.totals).toEqual(before.totals);
    expect(after.funds).toEqual(before.funds);
    expect(after.months.map((m) => m.periodStatus)).toEqual(
      before.months.map((m) => m.periodStatus),
    );
    const income = after.congregations!.reduce((sum, c) => sum + c.income, 0);
    expect(income).toBe(after.totals.income);
  });

  it('isolates sedes and denominations', async () => {
    const norte = await signIn(PASTOR_NORTE);
    const report = await firstValueFrom(norte.repository.financialReport(OCTOBER));
    expect(report.totals).toEqual(expectedTotals(norte.store, [2], OCTOBER.from, OCTOBER.to));

    TestBed.resetTestingModule();
    const other = await signIn(ADMIN_DENOMINATION_2);
    const options = await firstValueFrom(other.repository.options());
    expect(options.funds.map((f) => f.id)).toEqual([DEMO_FUNDS.vidaNuevaGeneral]);
    const ownReport = await firstValueFrom(other.repository.financialReport(OCTOBER));
    expect(ownReport.totals).toEqual(expectedTotals(other.store, [4, 5], OCTOBER.from, OCTOBER.to));
    const error = await failure(
      firstValueFrom(other.repository.financialReport({ ...OCTOBER, fundId: DEMO_FUNDS.local })),
    );
    expect(error.code).toBe('FUND_NOT_FOUND');
  });

  it('exports the contribution detail only for contributions.write', async () => {
    const pastor = await signIn(PASTOR_CENTRAL);
    const forbidden = await failure(firstValueFrom(pastor.repository.contributionDetail(OCTOBER)));
    expect(forbidden.code).toBe('FORBIDDEN');

    TestBed.resetTestingModule();
    const treasurer = await signIn(TREASURER_CENTRAL);
    const rows = await firstValueFrom(treasurer.repository.contributionDetail(OCTOBER));
    const expected = treasurer.store.contributions.filter(
      (c) => c.congregationId === 1 && c.receivedOn.startsWith('2026-10-'),
    );
    expect(rows).toHaveLength(expected.length);
    expect(rows.every((row) => row.congregationName === 'Sede Central')).toBe(true);
    expect(rows.some((row) => row.status === 'Anulado')).toBe(true);
  });

  it('rejects users without reports.read and invalid ranges', async () => {
    const secretary = await signIn(SECRETARY_CENTRAL);
    expect(
      (await failure(firstValueFrom(secretary.repository.financialReport(OCTOBER)))).code,
    ).toBe('FORBIDDEN');

    TestBed.resetTestingModule();
    const { repository } = await signIn(PASTOR_CENTRAL);
    const reversed = await failure(
      firstValueFrom(
        repository.financialReport({ from: '2026-10-31', to: '2026-10-01', fundId: null }),
      ),
    );
    expect(reversed.code).toBe('INVALID_RANGE');
    const crossing = await failure(
      firstValueFrom(
        repository.financialReport({ from: '2025-12-01', to: '2026-01-31', fundId: null }),
      ),
    );
    expect(crossing.code).toBe('RANGE_CROSSES_YEAR');
  });
});
