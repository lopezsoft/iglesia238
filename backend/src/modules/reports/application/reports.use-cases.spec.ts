import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import { buildTenantContext } from '../../../../test/support/tenants.js';
import type { DashboardContext } from '../../dashboard/application/dashboard.types.js';
import { buildPeriodWindow } from '../../dashboard/application/period-window.js';
import {
  ExportContributionsDetailUseCase,
  MAX_EXPORT_ROWS,
} from './export-contributions-detail.use-case.js';
import { GetFinancialReportUseCase } from './get-financial-report.use-case.js';
import { GetReportOptionsUseCase } from './get-report-options.use-case.js';
import type { ReportQuery } from './report.models.js';
import { ReportScopeResolver } from './report-scope.resolver.js';
import {
  FakeAudit,
  FakeClock,
  InMemoryFinancialData,
} from './testing/report-fakes.js';
import { CashBalanceWidgets } from './widgets/cash-balance.widgets.js';
import { IncomeWidgets } from './widgets/income.widgets.js';

const OCTOBER: ReportQuery = {
  from: '2026-10-01',
  to: '2026-10-31',
  fundId: null,
  congregationId: null,
};
const READ = ['reports.read'];

function world() {
  const data = new InMemoryFinancialData();
  data.denominations.set(1, 'Monte de Sión');
  data.denominations.set(2, 'Vida Nueva');
  data.congregations = [
    { id: 10, denominationId: 1, name: 'Sede Central', isActive: true },
    { id: 11, denominationId: 1, name: 'Sede Norte', isActive: true },
    { id: 12, denominationId: 1, name: 'Sede Antigua', isActive: false },
    { id: 13, denominationId: 1, name: 'Sede Cerrada', isActive: false },
    { id: 20, denominationId: 2, name: 'Sede Vida', isActive: true },
  ];
  data.funds = [
    { id: 1, denominationId: 1, name: 'Fondo Local', isActive: true },
    { id: 2, denominationId: 1, name: 'Fondo de Misiones', isActive: true },
    { id: 3, denominationId: 1, name: 'Campamento 2025', isActive: false },
    { id: 50, denominationId: 2, name: 'Fondo Vida', isActive: true },
  ];
  data.accounts = [
    {
      id: 1,
      denominationId: 1,
      code: '410505',
      name: 'Diezmos',
      nature: 'INCOME',
    },
    {
      id: 5,
      denominationId: 1,
      code: '410510',
      name: 'Ofrendas',
      nature: 'INCOME',
    },
    {
      id: 2,
      denominationId: 1,
      code: '421010',
      name: 'Intereses',
      nature: 'INCOME',
    },
    {
      id: 3,
      denominationId: 1,
      code: '510505',
      name: 'Servicios públicos',
      nature: 'EXPENSE',
    },
    {
      id: 60,
      denominationId: 2,
      code: '410505',
      name: 'Diezmos',
      nature: 'INCOME',
    },
  ];
  data.contributionTypes = [
    {
      id: 1,
      denominationId: 1,
      name: 'Diezmo',
      category: 'TITHE',
      accountId: 1,
    },
    {
      id: 2,
      denominationId: 1,
      name: 'Ofrenda',
      category: 'OFFERING',
      accountId: 5,
    },
  ];
  const cash = (
    congregationId: number,
    fundId: number,
    accountId: number,
    direction: 'IN' | 'OUT',
    amount: number,
    postedOn: string,
  ) =>
    data.cash.push({
      denominationId: 1,
      congregationId,
      fundId,
      accountId,
      direction,
      amount,
      postedOn,
    });
  // Sede Central, October.
  cash(10, 1, 1, 'IN', 3_000_000, '2026-10-05');
  cash(10, 1, 5, 'IN', 500_000, '2026-10-12');
  cash(10, 1, 2, 'IN', 18_500, '2026-10-20');
  cash(10, 1, 3, 'OUT', 1_200_000, '2026-10-08');
  cash(10, 1, 3, 'OUT', 200_000, '2026-10-09');
  cash(10, 1, 3, 'IN', 200_000, '2026-10-10'); // reversal of the previous line
  // Sede Central, before October.
  cash(10, 1, 1, 'IN', 2_000_000, '2026-09-15');
  cash(10, 1, 3, 'OUT', 500_000, '2026-03-10');
  // Other sedes.
  cash(11, 2, 1, 'IN', 1_000_000, '2026-10-06');
  cash(11, 2, 3, 'OUT', 300_000, '2026-10-07');
  cash(12, 1, 1, 'IN', 100_000, '2026-10-15');
  data.cash.push({
    denominationId: 2,
    congregationId: 20,
    fundId: 50,
    accountId: 60,
    direction: 'IN',
    amount: 9_999_999,
    postedOn: '2026-10-05',
  });
  data.openings.push({
    denominationId: 1,
    congregationId: 10,
    fundId: 1,
    year: 2026,
    amount: 18_450_000,
  });
  data.openings.push({
    denominationId: 1,
    congregationId: 11,
    fundId: 2,
    year: 2026,
    amount: 1_000_000,
  });
  for (const congregationId of [10, 11]) {
    data.periods.push({
      denominationId: 1,
      congregationId,
      year: 2026,
      month: 9,
      status: 'CLOSED',
    });
  }
  data.periods.push({
    denominationId: 1,
    congregationId: 10,
    year: 2026,
    month: 10,
    status: 'CLOSED',
  });
  data.periods.push({
    denominationId: 1,
    congregationId: 11,
    year: 2026,
    month: 10,
    status: 'OPEN',
  });
  data.periods.push({
    denominationId: 1,
    congregationId: 10,
    year: 2026,
    month: 11,
    status: 'OPEN',
  });
  // Contributions.
  const contribution = (
    id: number,
    congregationId: number,
    contributionTypeId: number,
    amount: number,
    receivedOn: string,
    status: 'RECORDED' | 'VOIDED' = 'RECORDED',
    name: string | null = 'Ana Pérez',
  ) =>
    data.contributions.push({
      id,
      denominationId: 1,
      congregationId,
      contributionTypeId,
      fundId: 1,
      amount,
      receivedOn,
      status,
      contributorName: name,
    });
  contribution(1, 10, 1, 1_500_000, '2026-10-05');
  contribution(2, 10, 1, 1_500_000, '2026-10-05', 'RECORDED', null);
  contribution(3, 10, 2, 500_000, '2026-10-12');
  contribution(4, 10, 1, 700_000, '2026-10-13', 'VOIDED');
  contribution(5, 11, 1, 1_000_000, '2026-10-06');
  contribution(6, 10, 1, 250_000, '2026-11-01');
  contribution(7, 10, 1, 200_000, '2026-11-02', 'RECORDED', '=HYPERLINK("x")');

  const clock = new FakeClock('2026-11-02');
  const audit = new FakeAudit();
  const scopes = new ReportScopeResolver(data);
  return {
    data,
    audit,
    scopes,
    options: new GetReportOptionsUseCase(scopes, data, clock),
    report: new GetFinancialReportUseCase(scopes, data),
    exporter: new ExportContributionsDetailUseCase(scopes, data, audit),
    income: new IncomeWidgets(scopes, data),
    cash: new CashBalanceWidgets(scopes, data),
    central: buildTenantContext({ permissions: READ }),
    wide: buildTenantContext({ kind: 'DENOMINATION', permissions: READ }),
    other: buildTenantContext({
      kind: 'DENOMINATION',
      denominationId: 2,
      congregationId: null,
      permissions: READ,
    }),
  };
}

describe('GetFinancialReportUseCase', () => {
  it('matches the cash book of the sede for a known range', async () => {
    const { report, central } = world();

    const result = await report.execute(central, OCTOBER);

    expect(result.totals).toEqual({
      income: 3_518_500,
      expense: 1_200_000,
      balance: 2_318_500,
    });
    expect(result.months).toHaveLength(1);
    expect(result.months[0]).toMatchObject({
      year: 2026,
      month: 10,
      label: 'Octubre 2026',
      shortLabel: 'Oct.',
      periodStatus: 'CLOSED',
      income: 3_518_500,
      expense: 1_200_000,
    });
    expect(result.congregations).toBeNull();
    expect(result.scopeLabel).toBe('Sede Central');
    expect(result.fundLabel).toBe('Todos los fondos');
    expect(result.closedPeriods).toBe(1);
    expect(result.openPeriods).toBe(0);
  });

  it('compares with the same number of days right before the range', async () => {
    const { report, central } = world();

    const result = await report.execute(central, OCTOBER);

    expect(result.previous).toMatchObject({
      from: '2026-08-31',
      to: '2026-09-30',
      income: 2_000_000,
      expense: 0,
      balance: 2_000_000,
    });
  });

  it('keeps the fund table consistent: closing = opening + inflows - outflows', async () => {
    const { report, central } = world();

    const result = await report.execute(central, OCTOBER);

    const local = result.funds.find((fund) => fund.fundId === 1)!;
    expect(local).toEqual({
      fundId: 1,
      name: 'Fondo Local',
      opening: 18_450_000 + 2_000_000 - 500_000,
      inflows: 3_518_500,
      outflows: 1_200_000,
      closing: 18_450_000 + 1_500_000 + 3_518_500 - 1_200_000,
    });
    // An inactive fund without balance or movements is hidden; the active ones stay.
    expect(result.funds.map((fund) => fund.fundId)).toEqual([1, 2]);
    for (const fund of result.funds) {
      expect(fund.closing).toBe(fund.opening + fund.inflows - fund.outflows);
    }
  });

  it('adds contributions by type from the recorded ones only and the other income', async () => {
    const { report, central } = world();

    const result = await report.execute(central, OCTOBER);

    expect(result.contributionsCount).toBe(3);
    expect(result.contributionsTotal).toBe(3_500_000);
    expect(
      result.contributionTypes.map((type) => [
        type.name,
        type.count,
        type.amount,
      ]),
    ).toEqual([
      ['Diezmo', 2, 3_000_000],
      ['Ofrenda', 1, 500_000],
    ]);
    expect(
      result.contributionTypes.reduce((sum, type) => sum + type.share, 0),
    ).toBeCloseTo(1, 6);
    expect(result.otherIncome).toBe(18_500);
  });

  it('reports the recorded contributions the cash book has not consolidated, apart from the cash income', async () => {
    const { report, central, data } = world();
    // 1 and 3 were consolidated; 2 (1.5M, no contributor) stays pending.
    for (const id of [1, 3]) {
      data.contributions.find((c) => c.id === id)!.consolidated = true;
    }

    const result = await report.execute(central, OCTOBER);

    // Sede Central, October: 2 is pending; 4 is voided and 5 belongs to another sede.
    expect(result.pendingConsolidation).toEqual({
      count: 1,
      amount: 1_500_000,
    });
  });

  it('does not count the pending contributions of another sede or outside the range', async () => {
    const { report, central, data } = world();
    for (const c of data.contributions) {
      c.consolidated = true;
    }
    data.contributions.find((c) => c.id === 6)!.consolidated = false;

    const result = await report.execute(central, OCTOBER);

    // The only pending one is in November.
    expect(result.pendingConsolidation).toEqual({ count: 0, amount: 0 });
  });

  it('builds the income statement by account, by code, netting reversals', async () => {
    const { report, central } = world();

    const { accounts } = await report.execute(central, OCTOBER);

    expect(accounts.map((account) => [account.code, account.amount])).toEqual([
      ['410505', 3_000_000],
      ['410510', 500_000],
      ['421010', 18_500],
      ['510505', 1_200_000],
    ]);
  });

  it('filters by fund', async () => {
    const { report, wide } = world();

    const result = await report.execute(wide, { ...OCTOBER, fundId: 2 });

    expect(result.fundLabel).toBe('Fondo de Misiones');
    expect(result.funds.map((fund) => fund.fundId)).toEqual([2]);
    expect(result.totals).toEqual({
      income: 1_000_000,
      expense: 300_000,
      balance: 700_000,
    });
  });

  it('breaks a denomination-wide report down per sede and adds up to the totals', async () => {
    const { report, wide } = world();

    const result = await report.execute(wide, OCTOBER);

    expect(result.scopeLabel).toBe('Monte de Sión (todas las sedes)');
    expect(result.congregations?.map((c) => c.name)).toEqual([
      'Sede Central',
      'Sede Norte',
      'Sede Antigua (inactiva)',
    ]);
    expect(result.congregations!.reduce((sum, c) => sum + c.income, 0)).toBe(
      result.totals.income,
    );
    expect(result.totals.income).toBe(3_518_500 + 1_000_000 + 100_000);
    // One sede still open makes the month open for the whole denomination.
    expect(result.months[0].periodStatus).toBe('OPEN');
  });

  it('lets a denomination session narrow the report to one sede', async () => {
    const { report, wide } = world();

    const result = await report.execute(wide, {
      ...OCTOBER,
      congregationId: 11,
    });

    expect(result.scopeLabel).toBe('Sede Norte');
    expect(result.congregations).toBeNull();
    expect(result.totals.income).toBe(1_000_000);
  });

  it('rejects wrong ranges and unknown funds', async () => {
    const { report, central } = world();

    await expect(
      report.execute(central, {
        ...OCTOBER,
        from: '2026-10-31',
        to: '2026-10-01',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RANGE' });
    await expect(
      report.execute(central, {
        ...OCTOBER,
        from: '2025-12-01',
        to: '2026-01-31',
      }),
    ).rejects.toMatchObject({ code: 'RANGE_CROSSES_YEAR' });
    await expect(
      report.execute(central, { ...OCTOBER, fundId: 999 }),
    ).rejects.toMatchObject({ code: 'FUND_NOT_FOUND' });
    // A fund of another denomination does not exist for this tenant.
    await expect(
      report.execute(central, { ...OCTOBER, fundId: 50 }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('answers 404 for a sede that is not in the scope of the session', async () => {
    const { report, central, other } = world();

    await expect(
      report.execute(central, { ...OCTOBER, congregationId: 11 }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      report.execute(other, { ...OCTOBER, congregationId: 10 }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('isolates tenants: another denomination only sees its own figures', async () => {
    const { report, other } = world();

    const result = await report.execute(other, OCTOBER);

    expect(result.totals.income).toBe(9_999_999);
    expect(result.contributionsCount).toBe(0);
    expect(result.congregations?.map((c) => c.name)).toEqual(['Sede Vida']);
  });

  it('runs a handful of grouped queries, whatever the number of movements', async () => {
    const { report, data, central } = world();
    for (let index = 0; index < 500; index++) {
      data.cash.push({
        denominationId: 1,
        congregationId: 10,
        fundId: 1,
        accountId: 1,
        direction: 'IN',
        amount: 10,
        postedOn: '2026-10-05',
      });
    }
    data.queries = 0;

    await report.execute(central, OCTOBER);

    // One month + the previous period + the days before the range.
    expect(data.queries).toBe(3);
  });

  it('is not available in the platform scope', async () => {
    const { report } = world();

    await expect(
      report.execute(
        buildTenantContext({ kind: 'PLATFORM', permissions: READ }),
        OCTOBER,
      ),
    ).rejects.toMatchObject({ code: 'PLATFORM_SCOPE_NOT_ALLOWED' });
  });
});

describe('GetReportOptionsUseCase', () => {
  it('names the scope, lists funds and offers the sedes to a denomination session', async () => {
    const { options, wide, central } = world();

    const result = await options.execute(wide);
    expect(result).toMatchObject({
      denominationWide: true,
      today: '2026-11-02',
      scopeLabel: 'Monte de Sión (todas las sedes)',
    });
    expect(result.funds.map((fund) => fund.id)).toContain(3);
    expect(result.funds.map((fund) => fund.id)).not.toContain(50);
    expect(result.congregations.map((c) => c.name)).toEqual([
      'Sede Central',
      'Sede Norte',
    ]);

    const sede = await options.execute(central);
    expect(sede).toMatchObject({
      denominationWide: false,
      scopeLabel: 'Sede Central',
      congregations: [],
    });
  });
});

describe('ExportContributionsDetailUseCase', () => {
  it('exports every contribution of the range as CSV and audits the export', async () => {
    const { exporter, audit, central } = world();

    const result = await exporter.execute(
      central,
      { ...OCTOBER, to: '2026-11-30' },
      '10.0.0.8',
    );

    expect(result.fileName).toBe('detalle-aportes_2026-10-01_2026-11-30.csv');
    expect(result.rows).toBe(6);
    expect(
      result.content.startsWith(
        '﻿Fecha;Recibo;Sede;Tipo de aporte;Aportante;Medio de pago;Referencia;Fondo;Valor;Estado',
      ),
    ).toBe(true);
    expect(result.content).toContain(
      '05/10/2026;REC-2026-00001;Sede Central;Diezmo;Ana Pérez;Efectivo;;Fondo Local;1500000;Registrado',
    );
    expect(result.content).toContain('Anónimo o colecta');
    expect(result.content).toContain('Anulado');
    // A name that would run as a formula in a spreadsheet is neutralized.
    expect(result.content).toContain(`'=HYPERLINK`);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'CONTRIBUTIONS_EXPORTED',
      entity: 'Contribution',
      ipAddress: '10.0.0.8',
    });
    expect(JSON.stringify(audit.entries[0].changes)).not.toContain('Ana');
  });

  it('never exports contributions of another sede or denomination', async () => {
    const { exporter, central, other } = world();

    const own = await exporter.execute(central, OCTOBER, null);
    expect(own.content).not.toContain('Sede Norte');
    expect(own.rows).toBe(4);
    expect((await exporter.execute(other, OCTOBER, null)).rows).toBe(0);
    await expect(
      exporter.execute(central, { ...OCTOBER, congregationId: 11 }, null),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('refuses a range with too many contributions and writes nothing to the audit log', async () => {
    const { exporter, data, audit, central } = world();
    for (let index = 0; index < MAX_EXPORT_ROWS; index++) {
      data.contributions.push({
        id: 1000 + index,
        denominationId: 1,
        congregationId: 10,
        contributionTypeId: 1,
        fundId: 1,
        amount: 1,
        receivedOn: '2026-10-20',
        status: 'RECORDED',
        contributorName: null,
      });
    }

    await expect(
      exporter.execute(central, OCTOBER, null),
    ).rejects.toMatchObject({ code: 'EXPORT_TOO_LARGE' });
    expect(audit.entries).toHaveLength(0);
  });

  it('validates the range and the fund', async () => {
    const { exporter, central } = world();

    await expect(
      exporter.execute(central, { ...OCTOBER, from: 'x' }, null),
    ).rejects.toMatchObject({ code: 'INVALID_RANGE' });
    await expect(
      exporter.execute(central, { ...OCTOBER, fundId: 50 }, null),
    ).rejects.toMatchObject({ code: 'FUND_NOT_FOUND' });
  });
});

describe('dashboard widgets', () => {
  function context(
    w: ReturnType<typeof world>,
    period: 'today' | 'month' = 'today',
  ): DashboardContext {
    return {
      tenant: w.central,
      window: buildPeriodWindow(period, '2026-11-02'),
    };
  }

  it('headlines the contributions of the period against the previous one, with the trend', async () => {
    const w = world();

    const { hero, kpis, trends } = await w.income.provide(context(w));

    expect(hero).toMatchObject({
      key: 'contributions',
      value: 200_000,
      previous: 250_000,
      format: 'currency',
      link: '/reports',
    });
    expect(hero?.series).toHaveLength(7);
    expect(kpis?.map((kpi) => kpi.key)).toEqual([
      'month-income',
      'month-expense',
    ]);
    const points = trends![0].points;
    expect(points).toHaveLength(6);
    expect(points.at(-1)).toEqual({ label: 'Nov', value: 450_000 });
    expect(points.at(-2)).toEqual({ label: 'Oct', value: 3_500_000 });
  });

  it('hides the sparkline when nothing was received', async () => {
    const w = world();
    w.data.contributions = [];

    const { hero } = await w.income.provide(context(w));

    expect(hero).toMatchObject({ value: 0, previous: 0, series: [] });
  });

  it('shows the balance of each fund and the open period of a sede', async () => {
    const w = world();

    const { panels } = await w.cash.provide(context(w));

    const panel = panels![0];
    expect(panel.subtitle).toBe('Periodo abierto: Noviembre 2026');
    expect(panel.stats[0]).toMatchObject({ key: 'total' });
    const local = panel.stats.find((stat) => stat.key === 'fund-1')!;
    expect(local.value).toBe(22_268_500);
  });

  it('declares the permissions and scopes that gate them', () => {
    const w = world();

    expect(w.income.requiredPermissions).toEqual(['reports.read']);
    expect(w.cash.requiredPermissions).toEqual(['cash-transactions.write']);
    expect(w.income.scopeKinds).not.toContain('PLATFORM');
  });
});
