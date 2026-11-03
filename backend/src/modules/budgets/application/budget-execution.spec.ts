import {
  budgetTotals,
  executedAmount,
  executedFromMovements,
  executionPct,
  expectedExecutionPct,
  groupByCommittee,
  monthlyBreakdown,
  toLineRow,
} from './budget-execution.js';
import type { BudgetLineData, ExecutionRow } from './budget.models.js';

describe('budget execution rules', () => {
  it('adds the natural direction of the account and subtracts the opposite one', () => {
    const rows: ExecutionRow[] = [
      { accountId: 10, fundId: 1, direction: 'OUT', amount: 300 },
      { accountId: 10, fundId: 1, direction: 'IN', amount: 50 },
      { accountId: 10, fundId: 2, direction: 'OUT', amount: 999 },
      { accountId: 11, fundId: 1, direction: 'OUT', amount: 999 },
    ];

    expect(executedAmount(rows, 10, 1, 'EXPENSE')).toBe(250);
    expect(executedAmount(rows, 10, 1, 'INCOME')).toBe(-250);
    expect(executedAmount(rows, 99, 1, 'EXPENSE')).toBe(0);
  });

  it('does not drift when adding cents', () => {
    const rows: ExecutionRow[] = [
      { accountId: 1, fundId: 1, direction: 'OUT', amount: 0.1 },
      { accountId: 1, fundId: 1, direction: 'OUT', amount: 0.2 },
    ];

    expect(executedAmount(rows, 1, 1, 'EXPENSE')).toBe(0.3);
    expect(
      executedFromMovements(
        [
          { direction: 'IN', amount: 0.1 },
          { direction: 'IN', amount: 0.2 },
        ],
        'INCOME',
      ),
    ).toBe(0.3);
  });

  it('computes percentages with one decimal and zero without an annual amount', () => {
    expect(executionPct(4_200_000, 3_000_000)).toBe(140);
    expect(executionPct(1, 3)).toBe(33.3);
    expect(executionPct(10, 0)).toBe(0);
  });

  it('computes totals of a set of lines', () => {
    expect(
      budgetTotals([
        { annualAmount: 1_000, monthlyAmount: 100, executed: 500 },
        { annualAmount: 500, monthlyAmount: null, executed: 700 },
      ]),
    ).toEqual({
      annual: 1_500,
      monthly: 100,
      executed: 1_200,
      executionPct: 80,
      difference: 300,
    });
    expect(budgetTotals([])).toEqual({
      annual: 0,
      monthly: 0,
      executed: 0,
      executionPct: 0,
      difference: 0,
    });
  });

  it('expects the closed months of the current year, all of a past year and none of a future one', () => {
    expect(expectedExecutionPct(2026, '2026-11-02')).toBe(83.3);
    expect(expectedExecutionPct(2026, '2026-01-15')).toBe(0);
    expect(expectedExecutionPct(2025, '2026-11-02')).toBe(100);
    expect(expectedExecutionPct(2027, '2026-11-02')).toBe(0);
  });

  it('flags over-execution and a negative difference', () => {
    const line: BudgetLineData = {
      id: 1,
      budgetId: 1,
      accountId: 10,
      accountCode: '540510',
      accountName: 'Mantenimiento',
      nature: 'EXPENSE',
      fundId: 1,
      fundName: 'Fondo Local',
      monthlyAmount: null,
      annualAmount: 2_000_000,
    };

    expect(toLineRow(line, 2_800_000, [])).toMatchObject({
      executionPct: 140,
      overExecuted: true,
      difference: -800_000,
    });
    expect(toLineRow(line, 2_000_000, [])).toMatchObject({
      executionPct: 100,
      overExecuted: false,
    });
  });

  it('groups committee lines by committee, ordered by name', () => {
    const base = {
      budgetId: 1,
      accountId: 1,
      accountCode: '1',
      accountName: 'A',
      nature: 'EXPENSE' as const,
      monthlyAmount: null,
      annualAmount: 100,
    };
    const lines = [
      toLineRow({ ...base, id: 1, fundId: 2, fundName: 'Jóvenes' }, 10, []),
      toLineRow({ ...base, id: 2, fundId: 1, fundName: 'Damas' }, 20, []),
      toLineRow({ ...base, id: 3, fundId: 2, fundName: 'Jóvenes' }, 30, []),
    ];

    const groups = groupByCommittee(lines);

    expect(groups.map((g) => g.fundName)).toEqual(['Damas', 'Jóvenes']);
    expect(groups[1].totals).toMatchObject({ annual: 200, executed: 40 });
  });

  it('breaks a line down by month with the monthly value or a twelfth', () => {
    const movements = [
      {
        id: 1,
        postedOn: '2026-01-10',
        direction: 'OUT' as const,
        amount: 100,
        description: 'a',
      },
      {
        id: 2,
        postedOn: '2026-01-20',
        direction: 'OUT' as const,
        amount: 50,
        description: 'b',
      },
      {
        id: 3,
        postedOn: '2026-03-02',
        direction: 'OUT' as const,
        amount: 70,
        description: 'c',
      },
    ];

    const months = monthlyBreakdown(
      { annualAmount: 1_200, monthlyAmount: null, nature: 'EXPENSE' },
      movements,
    );

    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ month: 1, planned: 100, executed: 150 });
    expect(months[2]).toMatchObject({ month: 3, executed: 70 });
    expect(months[1].executed).toBe(0);
    expect(
      monthlyBreakdown(
        { annualAmount: 1_200, monthlyAmount: 90, nature: 'EXPENSE' },
        [],
      )[5].planned,
    ).toBe(90);
  });
});
