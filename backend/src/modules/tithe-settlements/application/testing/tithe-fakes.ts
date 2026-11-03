import type {
  AuditEntry,
  AuditRecorder,
} from '../../../../common/audit/audit-recorder.port.js';
import { DocumentNumberingService } from '../../../../common/numbering/document-numbering.service.js';
import type { DocumentSequenceStore } from '../../../../common/numbering/document-sequence.store.js';
import { buildPage } from '../../../../common/pagination/page.js';
import type { Page } from '../../../../common/pagination/page.js';
import type {
  Transaction,
  TransactionRunner,
} from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { ConflictDomainException } from '../../../../common/errors/domain.exception.js';
import type {
  BookingTargets,
  NewSettlement,
  SettlementDetailData,
  SettlementListQuery,
  SettlementRecord,
  TitheContributionData,
  TitheRangeView,
  TitheYearSummary,
  VoidOutcome,
  VoidSettlementInput,
} from '../tithe-settlement.models.js';
import type {
  CongregationInfo,
  PeriodRecord,
  TitheRuleReader,
  TitheRuleRecord,
  TitheSettlementReader,
  TitheSettlementWriter,
} from '../tithe-settlement.ports.js';

export const FAKE_TRANSACTION: Transaction = { kind: 'transaction' };

export class FakeClock extends Clock {
  constructor(private current: string) {
    super();
  }

  now(): Date {
    return new Date(`${this.current}T12:00:00-05:00`);
  }

  set(date: string): void {
    this.current = date;
  }
}

export class FakeTransactionRunner implements TransactionRunner {
  run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    return work(FAKE_TRANSACTION);
  }
}

export class FakeAudit implements AuditRecorder {
  readonly entries: AuditEntry[] = [];

  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

class CountingSequenceStore implements DocumentSequenceStore {
  private readonly values = new Map<string, number>();

  next(scope: TenantScope, key: string): Promise<number> {
    const id = `${scope.congregationId}:${key}`;
    const value = (this.values.get(id) ?? 0) + 1;
    this.values.set(id, value);
    return Promise.resolve(value);
  }

  peek(scope: TenantScope, key: string): number {
    return this.values.get(`${scope.congregationId}:${key}`) ?? 0;
  }
}

export function fakeNumbering() {
  const store = new CountingSequenceStore();
  return {
    store,
    service: new DocumentNumberingService(store, new FakeTransactionRunner()),
  };
}

export interface FakeTithe extends TitheContributionData {
  readonly denominationId: number;
  readonly congregationId: number;
}

export interface FakeSettlement {
  id: number;
  denominationId: number;
  congregationId: number;
  voucherNumber: number;
  settledOn: string;
  coveredFrom: string;
  coveredTo: string;
  grossTithe: number;
  nationalShareRate: number;
  localFundRate: number;
  nationalShare: number;
  localFundShare: number;
  pastorNet: number;
  status: 'ISSUED' | 'VOIDED';
  voidReason: string | null;
}

export interface FakeCashLine {
  id: number;
  denominationId: number;
  congregationId: number;
  voucherNumber: number;
  direction: 'IN' | 'OUT';
  amount: number;
  accountId: number;
  fundId: number;
  reversalOfId: number | null;
  description: string;
}

export interface FakePeriod extends PeriodRecord {
  readonly denominationId: number;
  readonly congregationId: number;
  readonly year: number;
  readonly month: number;
}

/** In-memory stand-in for the database: the same port contracts, tenant filters included. */
export class InMemoryTitheLedger
  implements TitheSettlementReader, TitheSettlementWriter, TitheRuleReader
{
  congregations = new Map<
    number,
    CongregationInfo & { denominationId: number }
  >();
  tithes: FakeTithe[] = [];
  settlements: FakeSettlement[] = [];
  cash: FakeCashLine[] = [];
  periods: FakePeriod[] = [];
  rules: (TitheRuleRecord & { denominationId: number })[] = [];
  bookings: BookingTargets = {
    nationalShare: null,
    pastorNet: null,
    localFundName: 'Fondo Local',
  };
  private nextSettlementId = 1;
  private nextCashId = 1;
  private readonly sequence = new Map<number, number>();

  /** Mirrors the numbering service: the writer receives the number it reserved. */
  reservedNumber(congregationId: number): number {
    return this.sequence.get(congregationId) ?? 0;
  }

  findCongregation(scope: TenantScope): Promise<CongregationInfo | null> {
    const found = this.congregations.get(scope.requireCongregationId());
    return Promise.resolve(
      found && found.denominationId === scope.denominationId ? found : null,
    );
  }

  findTithesInRange(
    scope: TenantScope,
    range: TitheRangeView,
  ): Promise<TitheContributionData[]> {
    return Promise.resolve(
      this.tithes.filter(
        (tithe) =>
          tithe.denominationId === scope.denominationId &&
          tithe.congregationId === scope.congregationId &&
          tithe.receivedOn >= range.from &&
          tithe.receivedOn <= range.to,
      ),
    );
  }

  findOverlapping(
    scope: TenantScope,
    range: TitheRangeView,
  ): Promise<SettlementRecord | null> {
    const found = this.settlements.find(
      (settlement) =>
        this.owns(scope, settlement) &&
        settlement.status === 'ISSUED' &&
        range.from <= settlement.coveredTo &&
        range.to >= settlement.coveredFrom,
    );
    return Promise.resolve(found ? this.record(found) : null);
  }

  findLastIssuedRange(scope: TenantScope): Promise<TitheRangeView | null> {
    const last = this.settlements
      .filter((s) => this.owns(scope, s) && s.status === 'ISSUED')
      .sort((a, b) => b.coveredTo.localeCompare(a.coveredTo))[0];
    return Promise.resolve(
      last ? { from: last.coveredFrom, to: last.coveredTo } : null,
    );
  }

  summarizeYear(scope: TenantScope, year: number): Promise<TitheYearSummary> {
    const issued = this.settlements.filter(
      (s) =>
        this.owns(scope, s) &&
        s.status === 'ISSUED' &&
        s.settledOn.startsWith(`${year}-`),
    );
    const sum = (pick: (s: FakeSettlement) => number) =>
      issued.reduce((total, s) => total + pick(s), 0);
    return Promise.resolve({
      year,
      issuedCount: issued.length,
      grossTithe: sum((s) => s.grossTithe),
      nationalShare: sum((s) => s.nationalShare),
      localFundShare: sum((s) => s.localFundShare),
      pastorNet: sum((s) => s.pastorNet),
    });
  }

  list(
    scope: TenantScope,
    query: SettlementListQuery,
  ): Promise<Page<SettlementRecord>> {
    const rows = this.settlements
      .filter(
        (s) =>
          this.owns(scope, s) &&
          (query.status === null || s.status === query.status) &&
          (query.from === null || s.settledOn >= query.from) &&
          (query.to === null || s.settledOn <= query.to),
      )
      .sort((a, b) => b.settledOn.localeCompare(a.settledOn) || b.id - a.id);
    const start = (query.page - 1) * query.pageSize;
    return Promise.resolve(
      buildPage(
        rows.slice(start, start + query.pageSize).map((s) => this.record(s)),
        rows.length,
        query,
      ),
    );
  }

  findById(scope: TenantScope, id: number): Promise<SettlementRecord | null> {
    const found = this.settlements.find(
      (s) => s.id === id && this.owns(scope, s),
    );
    return Promise.resolve(found ? this.record(found) : null);
  }

  findDetail(
    scope: TenantScope,
    id: number,
  ): Promise<SettlementDetailData | null> {
    const found = this.settlements.find(
      (s) => s.id === id && this.owns(scope, s),
    );
    if (!found) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      record: this.record(found),
      congregationName:
        this.congregations.get(found.congregationId)?.name ?? '',
      voidedByName: null,
      contributions: this.tithes.filter((t) => t.titheSettlementId === id),
      cashLines: [],
    });
  }

  peekNextVoucherNumber(scope: TenantScope): Promise<number> {
    return Promise.resolve(
      this.reservedNumber(scope.requireCongregationId()) + 1,
    );
  }

  findBookingTargets(): Promise<BookingTargets> {
    return Promise.resolve(this.bookings);
  }

  findPeriod(
    scope: TenantScope,
    year: number,
    month: number,
  ): Promise<PeriodRecord | null> {
    const found = this.periods.find(
      (p) =>
        p.denominationId === scope.denominationId &&
        p.congregationId === scope.congregationId &&
        p.year === year &&
        p.month === month,
    );
    return Promise.resolve(found ?? null);
  }

  findInForce(
    denominationId: number,
    date: string,
  ): Promise<TitheRuleRecord | null> {
    return Promise.resolve(
      this.rules
        .filter(
          (r) => r.denominationId === denominationId && r.effectiveFrom <= date,
        )
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ??
        null,
    );
  }

  create(scope: TenantScope, input: NewSettlement): Promise<SettlementRecord> {
    const congregationId = scope.requireCongregationId();
    this.sequence.set(congregationId, input.voucherNumber);
    const linkable = this.tithes.filter(
      (t) =>
        input.contributionIds.includes(t.id) &&
        t.status === 'RECORDED' &&
        t.titheSettlementId === null,
    );
    if (linkable.length !== input.contributionIds.length) {
      return Promise.reject(
        new ConflictDomainException('Los diezmos cambiaron.', 'TITHES_CHANGED'),
      );
    }
    const settlement: FakeSettlement = {
      id: this.nextSettlementId++,
      denominationId: scope.denominationId,
      congregationId,
      voucherNumber: input.voucherNumber,
      settledOn: input.settledOn,
      coveredFrom: input.coveredFrom,
      coveredTo: input.coveredTo,
      grossTithe: input.grossTithe,
      nationalShareRate: input.nationalShareRate,
      localFundRate: input.localFundRate,
      nationalShare: input.nationalShare,
      localFundShare: input.localFundShare,
      pastorNet: input.pastorNet,
      status: 'ISSUED',
      voidReason: null,
    };
    this.settlements.push(settlement);
    this.tithes = this.tithes.map((t) =>
      input.contributionIds.includes(t.id)
        ? { ...t, titheSettlementId: settlement.id }
        : t,
    );
    for (const line of input.cashLines) {
      this.cash.push({
        id: this.nextCashId++,
        denominationId: scope.denominationId,
        congregationId,
        voucherNumber: input.voucherNumber,
        direction: 'OUT',
        amount: line.amount,
        accountId: line.accountId,
        fundId: line.fundId,
        reversalOfId: null,
        description: line.description,
      });
    }
    return Promise.resolve(this.record(settlement));
  }

  void(
    scope: TenantScope,
    id: number,
    input: VoidSettlementInput,
  ): Promise<VoidOutcome | null> {
    const settlement = this.settlements.find(
      (s) => s.id === id && this.owns(scope, s) && s.status === 'ISSUED',
    );
    if (!settlement) {
      return Promise.resolve(null);
    }
    settlement.status = 'VOIDED';
    settlement.voidReason = input.reason;
    const reversible = this.cash.filter(
      (line) =>
        line.voucherNumber === settlement.voucherNumber &&
        line.congregationId === settlement.congregationId &&
        line.reversalOfId === null &&
        !this.cash.some((other) => other.reversalOfId === line.id),
    );
    for (const line of reversible) {
      this.cash.push({
        ...line,
        id: this.nextCashId++,
        direction: line.direction === 'IN' ? 'OUT' : 'IN',
        reversalOfId: line.id,
        description: input.reversalDescription,
      });
    }
    const released = this.tithes.filter((t) => t.titheSettlementId === id);
    this.tithes = this.tithes.map((t) =>
      t.titheSettlementId === id ? { ...t, titheSettlementId: null } : t,
    );
    return Promise.resolve({
      record: this.record(settlement),
      releasedCount: released.length,
      reversedCount: reversible.length,
    });
  }

  private owns(scope: TenantScope, settlement: FakeSettlement): boolean {
    return (
      settlement.denominationId === scope.denominationId &&
      settlement.congregationId === scope.congregationId
    );
  }

  private record(settlement: FakeSettlement): SettlementRecord {
    return {
      id: settlement.id,
      voucherType: 'LD',
      voucherNumber: settlement.voucherNumber,
      voucherIssuedOn: settlement.settledOn,
      settledOn: settlement.settledOn,
      coveredFrom: settlement.coveredFrom,
      coveredTo: settlement.coveredTo,
      grossTithe: settlement.grossTithe,
      nationalShareRate: settlement.nationalShareRate,
      localFundRate: settlement.localFundRate,
      nationalShare: settlement.nationalShare,
      localFundShare: settlement.localFundShare,
      pastorNet: settlement.pastorNet,
      status: settlement.status,
      voidedAt:
        settlement.status === 'VOIDED' ? '2026-11-02T12:00:00.000Z' : null,
      voidReason: settlement.voidReason,
      contributionCount: this.tithes.filter(
        (t) => t.titheSettlementId === settlement.id,
      ).length,
    };
  }
}
