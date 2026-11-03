import {
  fromCents,
  signedCents,
  toCents,
} from '../../src/common/accounting/accounting-rules.js';
import type { PeriodRecord } from '../../src/common/accounting/period-view.js';
import type { DocumentSequenceStore } from '../../src/common/numbering/document-sequence.store.js';
import type { TenantScope } from '../../src/common/tenancy/tenant-scope.js';
import type {
  CashAccountRecord,
  CashBookRepository,
  CashFundRecord,
  CashLineRecord,
  Direction,
  LineFilter,
  LineIndexEntry,
  NewTransaction,
  PendingContribution,
  VoucherRef,
} from '../../src/modules/cash-book/application/cash-book.repository.js';
import type {
  VoucherDetailRecord,
  VoucherFilter,
  VoucherReadRepository,
  VoucherRecord,
} from '../../src/modules/cash-book/application/voucher.repository.js';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface Tenanted {
  denominationId: number;
}
interface Sede extends Tenanted {
  congregationId: number;
}

interface VoucherRow extends Sede {
  id: number;
  type: string;
  number: number;
  issuedOn: string;
  voidedAt: Date | null;
  voidReason: string | null;
}

interface LineRow extends Sede {
  id: number;
  periodId: number;
  accountId: number;
  fundId: number;
  voucherId: number | null;
  direction: Direction;
  postedOn: string;
  amount: number;
  description: string;
  reversalOfId: number | null;
  createdById: number;
}

export interface ContributionRow extends Sede {
  id: number;
  amount: number;
  receivedOn: string;
  accountId: number;
  status: 'RECORDED' | 'VOIDED';
  cashTransactionId: number | null;
  /** Receipt (REC) of the contribution. */
  voucherId?: number | null;
}

/** Counters of DocumentSequence, shared by the numbering service and the book (to peek). */
export class FakeSequenceStore implements DocumentSequenceStore {
  readonly counters = new Map<string, number>();

  next(scope: TenantScope, key: string): Promise<number> {
    const id = `${scope.requireCongregationId()}:${key}`;
    const value = (this.counters.get(id) ?? 0) + 1;
    this.counters.set(id, value);
    return Promise.resolve(value);
  }

  peek(congregationId: number, key: string): number {
    return (this.counters.get(`${congregationId}:${key}`) ?? 0) + 1;
  }
}

/**
 * In-memory cash book that follows the same rules as the Prisma repository: every read filters by
 * denomination and congregation, a reversal is unique per line and contributions link only once.
 */
export class InMemoryCashBook
  implements CashBookRepository, VoucherReadRepository
{
  readonly funds: Mutable<CashFundRecord & Tenanted>[] = [];
  readonly accounts: (CashAccountRecord & Tenanted)[] = [];
  readonly periods: Mutable<PeriodRecord & Sede>[] = [];
  readonly vouchers: VoucherRow[] = [];
  readonly lines: LineRow[] = [];
  readonly contributions: ContributionRow[] = [];
  readonly openings: (Sede & {
    fundId: number;
    year: number;
    amount: number;
  })[] = [];
  private ids = {
    fund: 1,
    account: 1,
    period: 1,
    voucher: 1,
    line: 1,
    contribution: 1,
  };

  constructor(private readonly sequences: FakeSequenceStore) {}

  // --- Arrange helpers -----------------------------------------------------------------------------

  addFund(denominationId: number, name: string, isActive = true) {
    const fund = { id: this.ids.fund++, denominationId, name, isActive };
    this.funds.push(fund);
    return fund;
  }

  addAccount(
    denominationId: number,
    code: string,
    overrides: Partial<CashAccountRecord> = {},
  ) {
    const account = {
      id: this.ids.account++,
      denominationId,
      code,
      name: `Cuenta ${code}`,
      nature: 'EXPENSE' as const,
      isPostable: true,
      isActive: true,
      defaultFundId: null,
      ...overrides,
    };
    this.accounts.push(account);
    return account;
  }

  addPeriod(
    scope: TenantScope,
    year: number,
    month: number,
    status: 'OPEN' | 'CLOSED' = 'OPEN',
  ) {
    const period = {
      id: this.ids.period++,
      denominationId: scope.denominationId,
      congregationId: scope.requireCongregationId(),
      year,
      month,
      status,
      closedAt: status === 'CLOSED' ? new Date('2026-01-01T00:00:00Z') : null,
    };
    this.periods.push(period);
    return period;
  }

  setOpening(scope: TenantScope, fundId: number, year: number, amount: number) {
    this.openings.push({
      denominationId: scope.denominationId,
      congregationId: scope.requireCongregationId(),
      fundId,
      year,
      amount,
    });
  }

  addContribution(
    scope: TenantScope,
    data: Partial<ContributionRow> & { accountId: number },
  ) {
    const row: ContributionRow = {
      id: this.ids.contribution++,
      denominationId: scope.denominationId,
      congregationId: scope.requireCongregationId(),
      amount: 100_000,
      receivedOn: '2026-11-02',
      status: 'RECORDED',
      cashTransactionId: null,
      ...data,
    };
    this.contributions.push(row);
    return row;
  }

  /** Directly adds a line (history), with an optional voucher type. */
  addLine(
    scope: TenantScope,
    data: {
      periodId: number;
      accountId: number;
      fundId: number;
      direction: Direction;
      postedOn: string;
      amount: number;
      description?: string;
      voucherType?: string | null;
    },
  ): LineRow {
    let voucherId: number | null = null;
    if (data.voucherType) {
      const voucher: VoucherRow = {
        id: this.ids.voucher++,
        denominationId: scope.denominationId,
        congregationId: scope.requireCongregationId(),
        type: data.voucherType,
        number: this.vouchers.length + 1,
        issuedOn: data.postedOn,
        voidedAt: null,
        voidReason: null,
      };
      this.vouchers.push(voucher);
      voucherId = voucher.id;
    }
    const line: LineRow = {
      id: this.ids.line++,
      denominationId: scope.denominationId,
      congregationId: scope.requireCongregationId(),
      periodId: data.periodId,
      accountId: data.accountId,
      fundId: data.fundId,
      voucherId,
      direction: data.direction,
      postedOn: data.postedOn,
      amount: data.amount,
      description: data.description ?? 'Movimiento',
      reversalOfId: null,
      createdById: 7,
    };
    this.lines.push(line);
    return line;
  }

  // --- Catalogs ------------------------------------------------------------------------------------

  listFunds(scope: TenantScope): Promise<CashFundRecord[]> {
    return Promise.resolve(
      this.funds.filter((f) => f.denominationId === scope.denominationId),
    );
  }

  findFund(scope: TenantScope, id: number): Promise<CashFundRecord | null> {
    return Promise.resolve(
      this.funds.find(
        (f) => f.id === id && f.denominationId === scope.denominationId,
      ) ?? null,
    );
  }

  listPostableAccounts(scope: TenantScope): Promise<CashAccountRecord[]> {
    return Promise.resolve(
      this.accounts
        .filter(
          (a) =>
            a.denominationId === scope.denominationId &&
            a.isPostable &&
            a.isActive,
        )
        .toSorted((a, b) => a.code.localeCompare(b.code)),
    );
  }

  listAccounts(
    scope: TenantScope,
    ids: readonly number[],
  ): Promise<CashAccountRecord[]> {
    return Promise.resolve(
      this.accounts.filter(
        (a) => a.denominationId === scope.denominationId && ids.includes(a.id),
      ),
    );
  }

  findAccount(
    scope: TenantScope,
    id: number,
  ): Promise<CashAccountRecord | null> {
    return Promise.resolve(
      this.accounts.find(
        (a) => a.id === id && a.denominationId === scope.denominationId,
      ) ?? null,
    );
  }

  // --- Periods -------------------------------------------------------------------------------------

  private sedeOf<T extends Sede>(scope: TenantScope) {
    return (row: T) =>
      row.denominationId === scope.denominationId &&
      row.congregationId === scope.requireCongregationId();
  }

  listPeriods(scope: TenantScope): Promise<PeriodRecord[]> {
    return Promise.resolve(
      this.periods
        .filter(this.sedeOf(scope))
        .toSorted((a, b) => b.year - a.year || b.month - a.month),
    );
  }

  findPeriod(scope: TenantScope, id: number): Promise<PeriodRecord | null> {
    return Promise.resolve(
      this.periods.find((p) => p.id === id && this.sedeOf(scope)(p)) ?? null,
    );
  }

  closePeriod(
    scope: TenantScope,
    id: number,
    closedAt: Date,
  ): Promise<PeriodRecord> {
    const index = this.periods.findIndex(
      (p) => p.id === id && this.sedeOf(scope)(p),
    );
    this.periods[index] = {
      ...this.periods[index],
      status: 'CLOSED',
      closedAt,
    };
    return Promise.resolve(this.periods[index]);
  }

  ensurePeriod(
    scope: TenantScope,
    period: { year: number; month: number },
  ): Promise<PeriodRecord> {
    const existing = this.periods.find(
      (p) =>
        this.sedeOf(scope)(p) &&
        p.year === period.year &&
        p.month === period.month,
    );
    return Promise.resolve(
      existing ?? this.addPeriod(scope, period.year, period.month),
    );
  }

  carryOpeningBalances(scope: TenantScope, year: number): Promise<number> {
    const sede = this.sedeOf(scope);
    const closing = new Map<number, number>();
    for (const opening of this.openings.filter(
      (o) => sede(o) && o.year === year,
    )) {
      closing.set(opening.fundId, toCents(opening.amount));
    }
    for (const line of this.lines.filter(
      (l) => sede(l) && l.postedOn.startsWith(`${year}-`),
    )) {
      closing.set(
        line.fundId,
        (closing.get(line.fundId) ?? 0) +
          signedCents(line.direction, toCents(line.amount)),
      );
    }
    let created = 0;
    for (const [fundId, cents] of closing) {
      const exists = this.openings.some(
        (o) => sede(o) && o.fundId === fundId && o.year === year + 1,
      );
      if (!exists) {
        this.setOpening(scope, fundId, year + 1, fromCents(cents));
        created += 1;
      }
    }
    return Promise.resolve(created);
  }

  // --- Reading -------------------------------------------------------------------------------------

  private linesOf(scope: TenantScope, fundId: number, periodId: number) {
    return this.lines
      .filter(
        (l) =>
          this.sedeOf(scope)(l) &&
          l.fundId === fundId &&
          l.periodId === periodId,
      )
      .toSorted((a, b) => a.postedOn.localeCompare(b.postedOn) || a.id - b.id);
  }

  lineIndex(
    scope: TenantScope,
    fundId: number,
    periodId: number,
  ): Promise<LineIndexEntry[]> {
    return Promise.resolve(
      this.linesOf(scope, fundId, periodId).map((l) => ({
        id: l.id,
        direction: l.direction,
        amount: l.amount,
      })),
    );
  }

  openingBase(
    scope: TenantScope,
    fundId: number,
    year: number,
    beforeDate: string,
  ): Promise<{ yearOpening: number; movedBefore: number }> {
    const sede = this.sedeOf(scope);
    const yearOpening =
      this.openings.find(
        (o) => sede(o) && o.fundId === fundId && o.year === year,
      )?.amount ?? 0;
    const moved = this.lines
      .filter(
        (l) =>
          sede(l) &&
          l.fundId === fundId &&
          l.postedOn >= `${year}-01-01` &&
          l.postedOn < beforeDate,
      )
      .reduce((sum, l) => sum + signedCents(l.direction, toCents(l.amount)), 0);
    return Promise.resolve({ yearOpening, movedBefore: fromCents(moved) });
  }

  private voucherRef(voucherId: number | null): VoucherRef | null {
    const voucher = this.vouchers.find((v) => v.id === voucherId);
    return voucher
      ? {
          type: voucher.type,
          number: voucher.number,
          issuedOn: voucher.issuedOn,
        }
      : null;
  }

  private toRecord(line: LineRow): CashLineRecord {
    const account = this.accounts.find((a) => a.id === line.accountId)!;
    const reversal = this.lines.find((l) => l.reversalOfId === line.id);
    const original = this.lines.find((l) => l.id === line.reversalOfId);
    const dates = [
      ...new Set(
        this.contributions
          .filter((c) => c.cashTransactionId === line.id)
          .map((c) => c.receivedOn),
      ),
    ];
    return {
      id: line.id,
      postedOn: line.postedOn,
      accountId: line.accountId,
      accountCode: account.code,
      accountName: account.name,
      fundId: line.fundId,
      description: line.description,
      direction: line.direction,
      amount: line.amount,
      voucher: this.voucherRef(line.voucherId),
      reversalOfId: line.reversalOfId,
      reversalOfVoucher: original ? this.voucherRef(original.voucherId) : null,
      reversedBy: reversal
        ? { id: reversal.id, voucher: this.voucherRef(reversal.voucherId) }
        : null,
      consolidatedDates: dates,
    };
  }

  findLines(
    scope: TenantScope,
    filter: LineFilter,
  ): Promise<{ rows: CashLineRecord[]; total: number }> {
    const search = filter.search?.toLowerCase();
    const matching = this.linesOf(scope, filter.fundId, filter.periodId).filter(
      (l) => {
        const account = this.accounts.find((a) => a.id === l.accountId)!;
        return (
          (!filter.direction || l.direction === filter.direction) &&
          (!filter.accountId || l.accountId === filter.accountId) &&
          (!search ||
            l.description.toLowerCase().includes(search) ||
            account.code.startsWith(search) ||
            account.name.toLowerCase().includes(search))
        );
      },
    );
    return Promise.resolve({
      rows: matching
        .slice(filter.skip, filter.skip + filter.take)
        .map((l) => this.toRecord(l)),
      total: matching.length,
    });
  }

  findLine(scope: TenantScope, id: number): Promise<CashLineRecord | null> {
    const line = this.lines.find((l) => l.id === id && this.sedeOf(scope)(l));
    return Promise.resolve(line ? this.toRecord(line) : null);
  }

  peekNextVoucherNumber(scope: TenantScope, type: string): Promise<number> {
    return Promise.resolve(
      this.sequences.peek(scope.requireCongregationId(), `VOUCHER:${type}`),
    );
  }

  // --- Writing -------------------------------------------------------------------------------------

  createVoucher(
    scope: TenantScope,
    data: { type: string; number: number; issuedOn: string },
  ): Promise<{ id: number }> {
    const voucher: VoucherRow = {
      id: this.ids.voucher++,
      denominationId: scope.denominationId,
      congregationId: scope.requireCongregationId(),
      voidedAt: null,
      voidReason: null,
      ...data,
    };
    this.vouchers.push(voucher);
    return Promise.resolve({ id: voucher.id });
  }

  createTransaction(
    scope: TenantScope,
    data: NewTransaction,
  ): Promise<{ id: number }> {
    if (
      data.reversalOfId !== null &&
      this.lines.some((l) => l.reversalOfId === data.reversalOfId)
    ) {
      throw new Error('unique reversal violated');
    }
    const line: LineRow = {
      id: this.ids.line++,
      denominationId: scope.denominationId,
      congregationId: scope.requireCongregationId(),
      ...data,
    };
    this.lines.push(line);
    return Promise.resolve({ id: line.id });
  }

  // --- Contributions -------------------------------------------------------------------------------

  private isPending(scope: TenantScope) {
    return (c: ContributionRow) =>
      this.sedeOf(scope)(c) &&
      c.status === 'RECORDED' &&
      c.cashTransactionId === null;
  }

  listPendingContributions(
    scope: TenantScope,
    date: string,
  ): Promise<PendingContribution[]> {
    return Promise.resolve(
      this.contributions
        .filter((c) => this.isPending(scope)(c) && c.receivedOn === date)
        .map((c) => ({
          id: c.id,
          amount: c.amount,
          receivedOn: c.receivedOn,
          accountId: c.accountId,
          defaultFundId:
            this.accounts.find((a) => a.id === c.accountId)?.defaultFundId ??
            null,
        })),
    );
  }

  countPendingContributions(
    scope: TenantScope,
    from: string,
    to: string,
  ): Promise<number> {
    return Promise.resolve(
      this.contributions.filter(
        (c) =>
          this.isPending(scope)(c) &&
          c.receivedOn >= from &&
          c.receivedOn <= to,
      ).length,
    );
  }

  linkContributions(
    scope: TenantScope,
    ids: readonly number[],
    cashTransactionId: number,
  ): Promise<number> {
    let linked = 0;
    for (const contribution of this.contributions) {
      if (
        ids.includes(contribution.id) &&
        this.isPending(scope)(contribution)
      ) {
        contribution.cashTransactionId = cashTransactionId;
        linked += 1;
      }
    }
    return Promise.resolve(linked);
  }

  releaseContributions(
    scope: TenantScope,
    cashTransactionId: number,
  ): Promise<number> {
    let released = 0;
    for (const contribution of this.contributions) {
      if (
        contribution.cashTransactionId === cashTransactionId &&
        this.sedeOf(scope)(contribution)
      ) {
        contribution.cashTransactionId = null;
        released += 1;
      }
    }
    return Promise.resolve(released);
  }

  // --- Vouchers (read side) ------------------------------------------------------------------------

  private recordOf(voucher: VoucherRow): VoucherRecord {
    const lines = this.lines.filter((l) => l.voucherId === voucher.id);
    const contributions = this.contributions.filter(
      (c) => c.voucherId === voucher.id,
    );
    return {
      id: voucher.id,
      type: voucher.type,
      number: voucher.number,
      issuedOn: voucher.issuedOn,
      voidedAt: voucher.voidedAt,
      voidReason: voucher.voidReason,
      linesAmount: fromCents(
        lines.reduce((sum, l) => sum + toCents(l.amount), 0),
      ),
      linesCount: lines.length,
      contributionsAmount: fromCents(
        contributions.reduce((sum, c) => sum + toCents(c.amount), 0),
      ),
      contributionsCount: contributions.length,
      settlementGross: null,
    };
  }

  list(
    scope: TenantScope,
    filter: VoucherFilter,
  ): Promise<{ rows: VoucherRecord[]; total: number }> {
    const matching = this.vouchers
      .filter(
        (v) =>
          this.sedeOf(scope)(v) &&
          filter.types.includes(v.type) &&
          (!filter.from || v.issuedOn >= filter.from) &&
          (!filter.to || v.issuedOn <= filter.to) &&
          (filter.voided === undefined ||
            (v.voidedAt !== null) === filter.voided) &&
          (filter.number === undefined || v.number === filter.number),
      )
      .toSorted((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.id - a.id);
    return Promise.resolve({
      rows: matching
        .slice(filter.skip, filter.skip + filter.take)
        .map((v) => this.recordOf(v)),
      total: matching.length,
    });
  }

  find(scope: TenantScope, id: number): Promise<VoucherDetailRecord | null> {
    const voucher = this.vouchers.find(
      (v) => v.id === id && this.sedeOf(scope)(v),
    );
    if (!voucher) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      ...this.recordOf(voucher),
      letterhead: {
        denominationName: 'Iglesia Monte de Sion',
        legalName: 'Corporación Monte de Sion',
        taxId: '900.123.456-7',
        congregationName: 'Sede Central',
      },
      lines: this.lines
        .filter((l) => l.voucherId === voucher.id)
        .map((l) => ({
          id: l.id,
          postedOn: l.postedOn,
          accountCode:
            this.accounts.find((a) => a.id === l.accountId)?.code ?? '',
          accountName:
            this.accounts.find((a) => a.id === l.accountId)?.name ?? '',
          fundName: this.funds.find((f) => f.id === l.fundId)?.name ?? '',
          direction: l.direction,
          amount: l.amount,
          description: l.description,
          isReversal: l.reversalOfId !== null,
        })),
      contributions: this.contributions
        .filter((c) => c.voucherId === voucher.id)
        .map((c) => ({
          id: c.id,
          receivedOn: c.receivedOn,
          typeName: 'Diezmo',
          amount: c.amount,
          status: c.status,
          contributorName: 'Ana Pérez',
          paymentMethod: 'CASH',
        })),
    });
  }
}
