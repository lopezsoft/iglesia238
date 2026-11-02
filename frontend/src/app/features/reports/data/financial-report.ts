// Pure computations of the financial report. They take rows already limited to the tenant
// (denomination and, when there is one, sede), so the same code serves a sede and a whole
// denomination, and they mirror what the reports API computes.
import { DomainError } from '../../../core/errors/domain-error';
import { monthLabel, monthRange, roundMoney } from '../../accounting/data/accounting-rules';
import {
  Account,
  AccountingPeriod,
  CashTransaction,
  Contribution,
  ContributionType,
  Fund,
  FundOpeningBalance,
  MONTH_NAMES,
  PeriodStatus,
} from '../../accounting/data/accounting.models';
import {
  FinancialReport,
  MoneyTotals,
  ReportContributionType,
  ReportFundBalance,
  ReportMonth,
  ReportQuery,
} from './reports.models';

/** Rows of the tenant the report is computed from. */
export interface ReportSource {
  readonly accounts: readonly Account[];
  /** Funds of the denomination. */
  readonly funds: readonly Fund[];
  readonly contributionTypes: readonly ContributionType[];
  readonly openingBalances: readonly FundOpeningBalance[];
  readonly periods: readonly AccountingPeriod[];
  readonly transactions: readonly CashTransaction[];
  readonly contributions: readonly Contribution[];
  /** Sedes in scope, in display order. */
  readonly congregations: ReadonlyArray<{ readonly id: number; readonly name: string }>;
}

export interface ReportLabels {
  readonly scopeLabel: string;
  readonly fundLabel: string;
  /** Adds the per-sede breakdown (denomination-wide scope). */
  readonly byCongregation: boolean;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Rejects ranges the API rejects: malformed, reversed, or spanning two years. */
export function validateReportQuery(query: ReportQuery): void {
  if (
    !DATE_PATTERN.test(query.from) ||
    !DATE_PATTERN.test(query.to) ||
    Number.isNaN(Date.parse(query.from)) ||
    Number.isNaN(Date.parse(query.to))
  ) {
    throw new DomainError('INVALID_RANGE', 'Indica fechas válidas en «Desde» y «Hasta».');
  }
  if (query.from > query.to) {
    throw new DomainError(
      'INVALID_RANGE',
      'La fecha «Desde» no puede ser posterior a la fecha «Hasta».',
    );
  }
  if (query.from.slice(0, 4) !== query.to.slice(0, 4)) {
    throw new DomainError(
      'RANGE_CROSSES_YEAR',
      'El reporte cubre un solo año contable: elige fechas del mismo año.',
    );
  }
}

/** Income and expense of a set of lines, classified by the nature of the account. */
export function totalsOf(
  lines: readonly CashTransaction[],
  accounts: ReadonlyMap<number, Account>,
): MoneyTotals {
  let income = 0;
  let expense = 0;
  for (const line of lines) {
    // A reversal keeps the account of the original line, so it nets out within its nature.
    const nature =
      accounts.get(line.accountId)?.nature ?? (line.direction === 'IN' ? 'INCOME' : 'EXPENSE');
    if (nature === 'INCOME') {
      income += line.direction === 'IN' ? line.amount : -line.amount;
    } else {
      expense += line.direction === 'OUT' ? line.amount : -line.amount;
    }
  }
  return {
    income: roundMoney(income),
    expense: roundMoney(expense),
    balance: roundMoney(income - expense),
  };
}

export function buildFinancialReport(
  source: ReportSource,
  query: ReportQuery,
  labels: ReportLabels,
): FinancialReport {
  validateReportQuery(query);
  const accounts = new Map(source.accounts.map((account) => [account.id, account]));
  const ofFund = source.transactions.filter(
    (tx) => query.fundId === null || tx.fundId === query.fundId,
  );
  const between = (from: string, to: string): CashTransaction[] =>
    ofFund.filter((tx) => tx.postedOn >= from && tx.postedOn <= to);
  const inRange = between(query.from, query.to);

  const previousTo = addDays(query.from, -1);
  const previousFrom = addDays(previousTo, -daysBetween(query.from, query.to));
  const months = reportMonths(source, query, between, accounts);
  const contributionTypes = contributionsByType(source, query);
  const contributionsTotal = roundMoney(
    contributionTypes.reduce((sum, row) => sum + row.amount, 0),
  );
  const typeAccountIds = new Set(source.contributionTypes.map((type) => type.accountId));

  return {
    query,
    scopeLabel: labels.scopeLabel,
    fundLabel: labels.fundLabel,
    totals: totalsOf(inRange, accounts),
    previous: {
      from: previousFrom,
      to: previousTo,
      ...totalsOf(between(previousFrom, previousTo), accounts),
    },
    months,
    funds: fundBalances(source, query, accounts),
    contributionTypes: contributionTypes.map((row) => ({
      ...row,
      share: contributionsTotal === 0 ? 0 : row.amount / contributionsTotal,
    })),
    contributionsTotal,
    contributionsCount: contributionTypes.reduce((sum, row) => sum + row.count, 0),
    otherIncome: totalsOf(
      inRange.filter((tx) => !typeAccountIds.has(tx.accountId)),
      accounts,
    ).income,
    congregations: labels.byCongregation
      ? source.congregations.map((congregation) => ({
          congregationId: congregation.id,
          name: congregation.name,
          ...totalsOf(
            inRange.filter((tx) => tx.congregationId === congregation.id),
            accounts,
          ),
        }))
      : null,
    closedPeriods: months.filter((month) => month.periodStatus === 'CLOSED').length,
    openPeriods: months.filter((month) => month.periodStatus === 'OPEN').length,
  };
}

function reportMonths(
  source: ReportSource,
  query: ReportQuery,
  between: (from: string, to: string) => CashTransaction[],
  accounts: ReadonlyMap<number, Account>,
): ReportMonth[] {
  const year = Number(query.from.slice(0, 4));
  const first = Number(query.from.slice(5, 7));
  const last = Number(query.to.slice(5, 7));
  const sedeIds = source.congregations.map((c) => c.id);
  const months: ReportMonth[] = [];
  for (let month = first; month <= last; month++) {
    const range = monthRange({ year, month });
    const from = range.from < query.from ? query.from : range.from;
    const to = range.to > query.to ? query.to : range.to;
    months.push({
      year,
      month,
      label: monthLabel({ year, month }),
      shortLabel: `${capitalize((MONTH_NAMES[month - 1] ?? '').slice(0, 3))}.`,
      periodStatus: periodStatusOf(source.periods, sedeIds, year, month),
      ...totalsOf(between(from, to), accounts),
    });
  }
  return months;
}

/** CLOSED when every sede closed the month, OPEN when at least one is open, null without periods. */
function periodStatusOf(
  periods: readonly AccountingPeriod[],
  sedeIds: readonly number[],
  year: number,
  month: number,
): PeriodStatus | null {
  const matching = periods.filter(
    (p) => p.year === year && p.month === month && sedeIds.includes(p.congregationId),
  );
  if (matching.length === 0) {
    return null;
  }
  return matching.every((p) => p.status === 'CLOSED') ? 'CLOSED' : 'OPEN';
}

function fundBalances(
  source: ReportSource,
  query: ReportQuery,
  accounts: ReadonlyMap<number, Account>,
): ReportFundBalance[] {
  const year = Number(query.from.slice(0, 4));
  const yearStart = `${year}-01-01`;
  const sedeIds = new Set(source.congregations.map((c) => c.id));
  return source.funds
    .filter((fund) => query.fundId === null || fund.id === query.fundId)
    .map((fund) => {
      const lines = source.transactions.filter((tx) => tx.fundId === fund.id);
      const carried = source.openingBalances
        .filter((b) => b.fundId === fund.id && b.year === year && sedeIds.has(b.congregationId))
        .reduce((sum, b) => sum + b.amount, 0);
      const before = lines
        .filter((tx) => tx.postedOn >= yearStart && tx.postedOn < query.from)
        .reduce((sum, tx) => sum + (tx.direction === 'IN' ? tx.amount : -tx.amount), 0);
      const { income, expense } = totalsOf(
        lines.filter((tx) => tx.postedOn >= query.from && tx.postedOn <= query.to),
        accounts,
      );
      const opening = roundMoney(carried + before);
      return {
        fundId: fund.id,
        name: fund.name,
        isActive: fund.isActive,
        opening,
        inflows: income,
        outflows: expense,
        closing: roundMoney(opening + income - expense),
      };
    })
    .filter((row) => row.isActive || row.opening !== 0 || row.inflows !== 0 || row.outflows !== 0)
    .map(({ isActive: _isActive, ...row }) => row);
}

type ContributionTypeTotals = Omit<ReportContributionType, 'share'>;

function contributionsByType(source: ReportSource, query: ReportQuery): ContributionTypeTotals[] {
  const fundOfLine = new Map(source.transactions.map((tx) => [tx.id, tx.fundId]));
  const accounts = new Map(source.accounts.map((account) => [account.id, account]));
  const totals = new Map<number, { count: number; amount: number }>();
  for (const contribution of source.contributions) {
    if (
      contribution.status !== 'RECORDED' ||
      contribution.receivedOn < query.from ||
      contribution.receivedOn > query.to
    ) {
      continue;
    }
    if (
      query.fundId !== null &&
      contributionFund(contribution, source, fundOfLine, accounts) !== query.fundId
    ) {
      continue;
    }
    const current = totals.get(contribution.contributionTypeId) ?? { count: 0, amount: 0 };
    totals.set(contribution.contributionTypeId, {
      count: current.count + 1,
      amount: current.amount + contribution.amount,
    });
  }
  return [...totals.entries()]
    .map(([typeId, { count, amount }]) => {
      const type = source.contributionTypes.find((t) => t.id === typeId);
      return {
        contributionTypeId: typeId,
        name: type?.name ?? 'Otro',
        category: type?.category ?? 'OTHER',
        count,
        amount: roundMoney(amount),
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

/** Fund of a contribution: the one of its cash line or, before consolidation, the account default. */
export function contributionFund(
  contribution: Contribution,
  source: Pick<ReportSource, 'contributionTypes'>,
  fundOfLine: ReadonlyMap<number, number>,
  accounts: ReadonlyMap<number, Account>,
): number | null {
  if (contribution.cashTransactionId !== null) {
    const fundId = fundOfLine.get(contribution.cashTransactionId);
    if (fundId !== undefined) {
      return fundId;
    }
  }
  const type = source.contributionTypes.find((t) => t.id === contribution.contributionTypeId);
  return type ? (accounts.get(type.accountId)?.defaultFundId ?? null) : null;
}

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
