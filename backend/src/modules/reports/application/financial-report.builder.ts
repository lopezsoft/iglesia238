import {
  fromCents,
  monthLabel,
  toCents,
} from '../../../common/accounting/accounting-rules.js';
import type { DateSpan } from './ports/financial-data.reader.js';
import type { MonthSpan } from './report-range.js';
import type {
  AccountData,
  CashSumRow,
  CongregationData,
  ContributionTypeData,
  ContributionTypeSum,
  FinancialReport,
  FundData,
  MoneyTotals,
  OpeningBalanceRow,
  PendingConsolidation,
  PeriodData,
  ReportAccount,
  ReportContributionType,
  ReportFundBalance,
  ReportMonth,
  ReportQuery,
} from './report.models.js';

const SHORT_MONTHS = [
  'Ene.',
  'Feb.',
  'Mar.',
  'Abr.',
  'May.',
  'Jun.',
  'Jul.',
  'Ago.',
  'Sep.',
  'Oct.',
  'Nov.',
  'Dic.',
] as const;

/** Everything the report is computed from. The reader produced it with one grouped query each. */
export interface FinancialReportInput {
  readonly query: ReportQuery;
  readonly scopeLabel: string;
  readonly fundLabel: string;
  readonly accounts: readonly AccountData[];
  /** Funds of the denomination. */
  readonly funds: readonly FundData[];
  readonly contributionTypes: readonly ContributionTypeData[];
  /** Sedes in scope, in display order. */
  readonly congregations: readonly CongregationData[];
  /** Adds the per-sede breakdown (denomination-wide report). */
  readonly byCongregation: boolean;
  /** One entry per month of the range, in order. */
  readonly months: readonly {
    readonly span: MonthSpan;
    readonly rows: readonly CashSumRow[];
  }[];
  readonly previous: {
    readonly span: DateSpan;
    readonly rows: readonly CashSumRow[];
  };
  /** Movements from January 1st of the year until the day before `from`. */
  readonly before: readonly CashSumRow[];
  readonly openingBalances: readonly OpeningBalanceRow[];
  readonly periods: readonly PeriodData[];
  readonly contributionSums: readonly ContributionTypeSum[];
  readonly pendingConsolidation: PendingConsolidation;
}

type NatureByAccount = ReadonlyMap<number, AccountData['nature']>;

/**
 * Income and expense of a set of cash lines, classified by the nature of the account. A reversal keeps
 * the account of the original line, so it nets out within its nature. Added in cents.
 */
export function totalsOf(
  rows: readonly CashSumRow[],
  natures: NatureByAccount,
): MoneyTotals {
  let income = 0;
  let expense = 0;
  for (const row of rows) {
    const cents = toCents(row.amount);
    const nature =
      natures.get(row.accountId) ??
      (row.direction === 'IN' ? 'INCOME' : 'EXPENSE');
    if (nature === 'INCOME') {
      income += row.direction === 'IN' ? cents : -cents;
    } else {
      expense += row.direction === 'OUT' ? cents : -cents;
    }
  }
  return {
    income: fromCents(income),
    expense: fromCents(expense),
    balance: fromCents(income - expense),
  };
}

/** CLOSED when every sede closed the month, OPEN when at least one is open, null without periods. */
function periodStatusOf(
  periods: readonly PeriodData[],
  congregationIds: ReadonlySet<number>,
  month: number,
): ReportMonth['periodStatus'] {
  const matching = periods.filter(
    (period) =>
      period.month === month && congregationIds.has(period.congregationId),
  );
  if (matching.length === 0) {
    return null;
  }
  return matching.every((period) => period.status === 'CLOSED')
    ? 'CLOSED'
    : 'OPEN';
}

function fundBalances(
  input: FinancialReportInput,
  range: readonly CashSumRow[],
  natures: NatureByAccount,
): ReportFundBalance[] {
  return input.funds
    .filter(
      (fund) => input.query.fundId === null || fund.id === input.query.fundId,
    )
    .map((fund) => {
      const carried = input.openingBalances
        .filter((row) => row.fundId === fund.id)
        .reduce((sum, row) => sum + toCents(row.amount), 0);
      // Before the range the balance moves with the direction of the cash, whatever the account.
      const before = input.before
        .filter((row) => row.fundId === fund.id)
        .reduce(
          (sum, row) =>
            sum +
            (row.direction === 'IN'
              ? toCents(row.amount)
              : -toCents(row.amount)),
          0,
        );
      const { income, expense } = totalsOf(
        range.filter((row) => row.fundId === fund.id),
        natures,
      );
      const opening = fromCents(carried + before);
      return {
        fundId: fund.id,
        name: fund.name,
        isActive: fund.isActive,
        opening,
        inflows: income,
        outflows: expense,
        closing: fromCents(
          toCents(opening) + toCents(income) - toCents(expense),
        ),
      };
    })
    .filter(
      (row) =>
        row.isActive ||
        row.opening !== 0 ||
        row.inflows !== 0 ||
        row.outflows !== 0,
    )
    .map((row) => ({
      fundId: row.fundId,
      name: row.name,
      opening: row.opening,
      inflows: row.inflows,
      outflows: row.outflows,
      closing: row.closing,
    }));
}

function accountsStatement(
  range: readonly CashSumRow[],
  accounts: readonly AccountData[],
): ReportAccount[] {
  const cents = new Map<number, number>();
  for (const row of range) {
    const account = accounts.find(
      (candidate) => candidate.id === row.accountId,
    );
    const natural = account?.nature === 'EXPENSE' ? 'OUT' : 'IN';
    cents.set(
      row.accountId,
      (cents.get(row.accountId) ?? 0) +
        (row.direction === natural
          ? toCents(row.amount)
          : -toCents(row.amount)),
    );
  }
  return accounts
    .filter((account) => (cents.get(account.id) ?? 0) !== 0)
    .map((account) => ({
      accountId: account.id,
      code: account.code,
      name: account.name,
      nature: account.nature,
      amount: fromCents(cents.get(account.id) ?? 0),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function contributionRows(
  sums: readonly ContributionTypeSum[],
  types: readonly ContributionTypeData[],
): {
  rows: Omit<ReportContributionType, 'share'>[];
  total: number;
  count: number;
} {
  const rows = sums
    .map((sum) => {
      const type = types.find(
        (candidate) => candidate.id === sum.contributionTypeId,
      );
      return {
        contributionTypeId: sum.contributionTypeId,
        name: type?.name ?? 'Otro',
        category: type?.category ?? ('OTHER' as const),
        count: sum.count,
        amount: sum.amount,
      };
    })
    .sort((a, b) => b.amount - a.amount);
  return {
    rows,
    total: fromCents(rows.reduce((sum, row) => sum + toCents(row.amount), 0)),
    count: rows.reduce((sum, row) => sum + row.count, 0),
  };
}

export function buildFinancialReport(
  input: FinancialReportInput,
): FinancialReport {
  const natures: NatureByAccount = new Map(
    input.accounts.map((account) => [account.id, account.nature]),
  );
  const range = input.months.flatMap((month) => month.rows);
  const congregationIds = new Set(input.congregations.map((c) => c.id));

  const months: ReportMonth[] = input.months.map(({ span, rows }) => ({
    year: span.year,
    month: span.month,
    label: monthLabel(span),
    shortLabel: SHORT_MONTHS[span.month - 1],
    periodStatus: periodStatusOf(input.periods, congregationIds, span.month),
    ...totalsOf(rows, natures),
  }));

  const contributions = contributionRows(
    input.contributionSums,
    input.contributionTypes,
  );
  const typeAccountIds = new Set(
    input.contributionTypes.map((type) => type.accountId),
  );

  const congregations = input.byCongregation
    ? input.congregations
        .map((congregation) => ({
          congregationId: congregation.id,
          name: congregation.isActive
            ? congregation.name
            : `${congregation.name} (inactiva)`,
          hasRows: range.some((row) => row.congregationId === congregation.id),
          isActive: congregation.isActive,
          ...totalsOf(
            range.filter((row) => row.congregationId === congregation.id),
            natures,
          ),
        }))
        // A deactivated sede only appears while it owns movements in the range.
        .filter((row) => row.isActive || row.hasRows)
        .map((row) => ({
          congregationId: row.congregationId,
          name: row.name,
          income: row.income,
          expense: row.expense,
          balance: row.balance,
        }))
    : null;

  return {
    query: input.query,
    scopeLabel: input.scopeLabel,
    fundLabel: input.fundLabel,
    totals: totalsOf(range, natures),
    previous: {
      ...input.previous.span,
      ...totalsOf(input.previous.rows, natures),
    },
    months,
    funds: fundBalances(input, range, natures),
    accounts: accountsStatement(range, input.accounts),
    contributionTypes: contributions.rows.map((row) => ({
      ...row,
      share: contributions.total === 0 ? 0 : row.amount / contributions.total,
    })),
    contributionsTotal: contributions.total,
    contributionsCount: contributions.count,
    pendingConsolidation: input.pendingConsolidation,
    otherIncome: totalsOf(
      range.filter((row) => !typeAccountIds.has(row.accountId)),
      natures,
    ).income,
    congregations,
    closedPeriods: months.filter((month) => month.periodStatus === 'CLOSED')
      .length,
    openPeriods: months.filter((month) => month.periodStatus === 'OPEN').length,
  };
}
