// E-07 Reportes financieros. Aggregated views over the accounting context: they never carry
// contributors, except the contribution detail that only contributions.write can export.
import { AccountNature, ContributionCategory, PeriodStatus } from '../../accounting/data/accounting.models';

/** Inclusive date range ('YYYY-MM-DD') of a single calendar year, optionally one fund or one sede. */
export interface ReportQuery {
  readonly from: string;
  readonly to: string;
  /** Null: every fund. */
  readonly fundId: number | null;
  /** Null: every sede of the scope (a denomination-wide session can narrow the report to one sede). */
  readonly congregationId: number | null;
}

export interface ReportFundOption {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
}

export interface ReportCongregationOption {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
}

export interface ReportOptions {
  readonly scopeLabel: string;
  /** True for "Toda la denominación": figures add every sede and come with a per-sede breakdown. */
  readonly denominationWide: boolean;
  readonly funds: readonly ReportFundOption[];
  /** Sedes the report can be narrowed to; empty for a session fixed on one sede. */
  readonly congregations: readonly ReportCongregationOption[];
  /** Today in Bogota: the default range is its whole year. */
  readonly today: string;
}

export interface MoneyTotals {
  readonly income: number;
  readonly expense: number;
  /** income − expense. */
  readonly balance: number;
}

export interface ReportMonth extends MoneyTotals {
  readonly year: number;
  readonly month: number;
  /** "Octubre 2026". */
  readonly label: string;
  /** "Oct." */
  readonly shortLabel: string;
  /** CLOSED only when every sede closed the month; null when no period exists. */
  readonly periodStatus: PeriodStatus | null;
}

/** closing = opening + inflows − outflows. */
export interface ReportFundBalance {
  readonly fundId: number;
  readonly name: string;
  readonly opening: number;
  readonly inflows: number;
  readonly outflows: number;
  readonly closing: number;
}

export interface ReportContributionType {
  readonly contributionTypeId: number;
  readonly name: string;
  readonly category: ContributionCategory;
  readonly count: number;
  readonly amount: number;
  /** 0–1 of the contributions total. */
  readonly share: number;
}

export interface ReportCongregation extends MoneyTotals {
  readonly congregationId: number;
  readonly name: string;
}

/** One line of the income statement by account. */
export interface ReportAccount {
  readonly accountId: number;
  readonly code: string;
  readonly name: string;
  readonly nature: AccountNature;
  readonly amount: number;
}

export interface FinancialReport {
  readonly query: ReportQuery;
  readonly scopeLabel: string;
  /** "Todos los fondos" or the fund name. */
  readonly fundLabel: string;
  readonly totals: MoneyTotals;
  /** Same number of days right before `from`. */
  readonly previous: MoneyTotals & { readonly from: string; readonly to: string };
  readonly months: readonly ReportMonth[];
  readonly funds: readonly ReportFundBalance[];
  /** Income statement by account, ordered by code. */
  readonly accounts: readonly ReportAccount[];
  readonly contributionTypes: readonly ReportContributionType[];
  readonly contributionsTotal: number;
  readonly contributionsCount: number;
  /** Recorded in the range but not yet consolidated in the cash book: absent from income, balances and the monthly flow. */
  readonly pendingConsolidation: { readonly count: number; readonly amount: number };
  /** Income on accounts that are not a contribution type (donations, interest, activities). */
  readonly otherIncome: number;
  /** Only for a denomination-wide scope. */
  readonly congregations: readonly ReportCongregation[] | null;
  readonly closedPeriods: number;
  readonly openPeriods: number;
}

/** Relative change (0.051 = +5,1 %), or null when the previous value is zero. */
export function variation(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / Math.abs(previous);
}

/** 0.051 → "+5,1 %"; −0.02 → "−2,0 %"; null → "—". */
export function formatVariation(value: number | null): string {
  if (value === null) {
    return '—';
  }
  const percent = Math.abs(value * 100).toLocaleString('es-CO', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${percent} %`;
}

/** 0.6013 → "60,1 %". */
export function formatShare(share: number): string {
  return `${(share * 100).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}
