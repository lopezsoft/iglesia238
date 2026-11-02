// Pure accounting rules shared by the demo adapters of every accounting screen. They take the
// rows as arguments (no state), so they are easy to test and mirror what the API computes.
import {
  Account,
  AccountNature,
  AccountingPeriod,
  CashTransaction,
  Contribution,
  ContributionDisplayStatus,
  FundOpeningBalance,
  MONTH_NAMES,
  TitheSettlementRule,
  VowPledge,
  VowPledgeStatus,
} from './accounting.models';

export interface YearMonth {
  readonly year: number;
  readonly month: number;
}

/** '2026-11-02' → { year: 2026, month: 11 }. */
export function yearMonthOf(date: string): YearMonth {
  const [year, month] = date.split('-').map(Number);
  return { year, month };
}

/** First and last day ('YYYY-MM-DD') of a month. */
export function monthRange({ year, month }: YearMonth): { from: string; to: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

/** "Noviembre 2026". */
export function monthLabel({ year, month }: YearMonth): string {
  const name = MONTH_NAMES[month - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Display number of a voucher: REC-2026-01872, CE-2026-00045. */
export function voucherCode(type: string, number: number, issuedOn: string): string {
  return `${type}-${issuedOn.slice(0, 4)}-${String(number).padStart(5, '0')}`;
}

// --- Periods -----------------------------------------------------------------------------------

/** Accounting period of a congregation that contains `date`, if it exists. */
export function periodFor(
  periods: readonly AccountingPeriod[],
  congregationId: number,
  date: string,
): AccountingPeriod | undefined {
  const { year, month } = yearMonthOf(date);
  return periods.find((p) => p.congregationId === congregationId && p.year === year && p.month === month);
}

export function isDateInOpenPeriod(
  periods: readonly AccountingPeriod[],
  congregationId: number,
  date: string,
): boolean {
  return periodFor(periods, congregationId, date)?.status === 'OPEN';
}

// --- Chart of accounts -------------------------------------------------------------------------

export function accountHasChildren(accounts: readonly Account[], accountId: number): boolean {
  return accounts.some((account) => account.parentId === accountId);
}

/** Active postable accounts of a denomination, optionally of one nature, ordered by code. */
export function postableAccounts(
  accounts: readonly Account[],
  denominationId: number,
  nature?: AccountNature,
): Account[] {
  return accounts
    .filter(
      (a) =>
        a.denominationId === denominationId &&
        a.isPostable &&
        a.isActive &&
        (nature === undefined || a.nature === nature),
    )
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** Depth of an account in the tree (0 for a root). */
export function accountDepth(accounts: readonly Account[], account: Account): number {
  let depth = 0;
  let parentId = account.parentId;
  while (parentId !== null && depth < 20) {
    depth++;
    parentId = accounts.find((a) => a.id === parentId)?.parentId ?? null;
  }
  return depth;
}

/** Accounts in tree order (parent, then its children by code). */
export function accountsInTreeOrder(accounts: readonly Account[]): Account[] {
  const byParent = new Map<number | null, Account[]>();
  for (const account of accounts) {
    const siblings = byParent.get(account.parentId) ?? [];
    siblings.push(account);
    byParent.set(account.parentId, siblings);
  }
  const ordered: Account[] = [];
  const visit = (parentId: number | null): void => {
    for (const child of (byParent.get(parentId) ?? []).sort((a, b) => a.code.localeCompare(b.code))) {
      ordered.push(child);
      visit(child.id);
    }
  };
  visit(null);
  return ordered;
}

// --- Funds -------------------------------------------------------------------------------------

export interface FundBalance {
  readonly opening: number;
  readonly income: number;
  readonly expense: number;
  readonly closing: number;
}

/**
 * Balance of a fund in a congregation for a month: the opening balance of the year plus the
 * movements of the months before (`opening`), and the movements of the month itself.
 */
export function fundBalance(
  openingBalances: readonly FundOpeningBalance[],
  transactions: readonly CashTransaction[],
  congregationId: number,
  fundId: number,
  { year, month }: YearMonth,
): FundBalance {
  const { from, to } = monthRange({ year, month });
  const yearStart = `${year}-01-01`;
  const yearOpening =
    openingBalances.find((b) => b.congregationId === congregationId && b.fundId === fundId && b.year === year)
      ?.amount ?? 0;
  let before = 0;
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (tx.congregationId !== congregationId || tx.fundId !== fundId || tx.postedOn < yearStart || tx.postedOn > to) {
      continue;
    }
    const signed = tx.direction === 'IN' ? tx.amount : -tx.amount;
    if (tx.postedOn < from) {
      before += signed;
    } else if (tx.direction === 'IN') {
      income += tx.amount;
    } else {
      expense += tx.amount;
    }
  }
  const opening = roundMoney(yearOpening + before);
  return {
    opening,
    income: roundMoney(income),
    expense: roundMoney(expense),
    closing: roundMoney(opening + income - expense),
  };
}

// --- Contributions and vows -----------------------------------------------------------------------

export function contributionDisplayStatus(
  contribution: Pick<Contribution, 'status' | 'titheSettlementId'>,
): ContributionDisplayStatus {
  if (contribution.status === 'VOIDED') {
    return 'VOIDED';
  }
  return contribution.titheSettlementId !== null ? 'SETTLED' : 'RECORDED';
}

/** Sum of the non-voided contributions linked to a pledge. */
export function vowPaidAmount(contributions: readonly Contribution[], pledgeId: number): number {
  return roundMoney(
    contributions
      .filter((c) => c.vowPledgeId === pledgeId && c.status !== 'VOIDED')
      .reduce((sum, c) => sum + c.amount, 0),
  );
}

/** Display number of a pledge: VOTO-2026-0014. */
export function vowPledgeCode(pledge: Pick<VowPledge, 'id' | 'pledgedOn'>): string {
  return `VOTO-${pledge.pledgedOn.slice(0, 4)}-${String(pledge.id).padStart(4, '0')}`;
}

/** CANCELLED is kept; otherwise FULFILLED once the paid amount covers the pledge. */
export function vowPledgeStatusFor(pledge: Pick<VowPledge, 'status' | 'pledgedAmount'>, paid: number): VowPledgeStatus {
  if (pledge.status === 'CANCELLED') {
    return 'CANCELLED';
  }
  return paid >= pledge.pledgedAmount ? 'FULFILLED' : 'ACTIVE';
}

// --- Tithe settlement --------------------------------------------------------------------------

/** Rule in force on `date` for a denomination (latest effectiveFrom not after the date). */
export function ruleInEffect(
  rules: readonly TitheSettlementRule[],
  denominationId: number,
  date: string,
): TitheSettlementRule | undefined {
  return rules
    .filter((r) => r.denominationId === denominationId && r.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

export interface TitheSplit {
  readonly nationalShare: number;
  readonly localFundShare: number;
  readonly pastorNet: number;
}

/** Splits a gross tithe with the formula of TitheSettlementRule. */
export function computeTitheSplit(
  grossTithe: number,
  rule: Pick<TitheSettlementRule, 'nationalShareRate' | 'localFundRate'>,
): TitheSplit {
  const nationalShare = roundMoney(grossTithe * rule.nationalShareRate);
  const localFundShare = roundMoney((grossTithe - nationalShare) * rule.localFundRate);
  return {
    nationalShare,
    localFundShare,
    pastorNet: roundMoney(grossTithe - nationalShare - localFundShare),
  };
}

// --- People --------------------------------------------------------------------------------------

/** "CC ···1904": enough to tell two homonyms apart without exposing the document. */
export function documentHint(typeCode: string | null, number: string | null): string {
  if (!number) {
    return 'Sin documento';
  }
  return `${typeCode ?? 'Doc.'} ···${number.slice(-4)}`;
}
