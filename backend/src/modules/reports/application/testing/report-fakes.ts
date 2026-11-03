import {
  fromCents,
  toCents,
} from '../../../../common/accounting/accounting-rules.js';
import type {
  AuditEntry,
  AuditRecorder,
} from '../../../../common/audit/audit-recorder.port.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import type {
  DataFilter,
  DateSpan,
  FinancialDataReader,
} from '../ports/financial-data.reader.js';
import type {
  AccountData,
  CashSumRow,
  CongregationData,
  ContributionDetailData,
  ContributionTypeData,
  ContributionTypeSum,
  DailyAmount,
  FundData,
  OpeningBalanceRow,
  PendingConsolidation,
  PeriodData,
} from '../report.models.js';

export class FakeClock extends Clock {
  constructor(private readonly current: string) {
    super();
  }

  now(): Date {
    return new Date(`${this.current}T12:00:00-05:00`);
  }
}

export class FakeAudit implements AuditRecorder {
  readonly entries: AuditEntry[] = [];

  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

export interface StoredCash {
  denominationId: number;
  congregationId: number;
  fundId: number;
  accountId: number;
  direction: 'IN' | 'OUT';
  amount: number;
  postedOn: string;
}

export interface StoredContribution {
  id: number;
  denominationId: number;
  congregationId: number;
  contributionTypeId: number;
  fundId: number | null;
  amount: number;
  receivedOn: string;
  status: 'RECORDED' | 'VOIDED';
  contributorName: string | null;
  /** True once the cash book turned it into a cash line. */
  consolidated?: boolean;
}

/** In-memory stand-in for the aggregating queries, with the same filters as the real reader. */
export class InMemoryFinancialData implements FinancialDataReader {
  denominations = new Map<number, string>();
  congregations: (CongregationData & { denominationId: number })[] = [];
  funds: (FundData & { denominationId: number })[] = [];
  accounts: (AccountData & { denominationId: number })[] = [];
  contributionTypes: (ContributionTypeData & { denominationId: number })[] = [];
  cash: StoredCash[] = [];
  openings: {
    denominationId: number;
    congregationId: number;
    fundId: number;
    year: number;
    amount: number;
  }[] = [];
  periods: (PeriodData & { denominationId: number; year: number })[] = [];
  contributions: StoredContribution[] = [];
  queries = 0;

  denominationName(denominationId: number): Promise<string | null> {
    return Promise.resolve(this.denominations.get(denominationId) ?? null);
  }

  listCongregations(denominationId: number): Promise<CongregationData[]> {
    return Promise.resolve(
      this.congregations.filter((c) => c.denominationId === denominationId),
    );
  }

  listFunds(denominationId: number): Promise<FundData[]> {
    return Promise.resolve(
      this.funds.filter((f) => f.denominationId === denominationId),
    );
  }

  listAccounts(denominationId: number): Promise<AccountData[]> {
    return Promise.resolve(
      this.accounts.filter((a) => a.denominationId === denominationId),
    );
  }

  listContributionTypes(
    denominationId: number,
  ): Promise<ContributionTypeData[]> {
    return Promise.resolve(
      this.contributionTypes.filter((t) => t.denominationId === denominationId),
    );
  }

  sumCash(filter: DataFilter, span: DateSpan): Promise<CashSumRow[]> {
    this.queries += 1;
    const grouped = new Map<string, CashSumRow>();
    for (const line of this.cash) {
      if (
        line.denominationId !== filter.denominationId ||
        !filter.congregationIds.includes(line.congregationId) ||
        (filter.fundId !== null && line.fundId !== filter.fundId) ||
        line.postedOn < span.from ||
        line.postedOn > span.to
      ) {
        continue;
      }
      const key = `${line.congregationId}:${line.fundId}:${line.accountId}:${line.direction}`;
      const current = grouped.get(key);
      grouped.set(key, {
        congregationId: line.congregationId,
        fundId: line.fundId,
        accountId: line.accountId,
        direction: line.direction,
        amount: fromCents(toCents(current?.amount ?? 0) + toCents(line.amount)),
      });
    }
    return Promise.resolve([...grouped.values()]);
  }

  sumOpeningBalances(
    filter: DataFilter,
    year: number,
  ): Promise<OpeningBalanceRow[]> {
    const byFund = new Map<number, number>();
    for (const row of this.openings) {
      if (
        row.denominationId === filter.denominationId &&
        filter.congregationIds.includes(row.congregationId) &&
        row.year === year &&
        (filter.fundId === null || row.fundId === filter.fundId)
      ) {
        byFund.set(
          row.fundId,
          (byFund.get(row.fundId) ?? 0) + toCents(row.amount),
        );
      }
    }
    return Promise.resolve(
      [...byFund.entries()].map(([fundId, cents]) => ({
        fundId,
        amount: fromCents(cents),
      })),
    );
  }

  listPeriods(filter: DataFilter, year: number): Promise<PeriodData[]> {
    return Promise.resolve(
      this.periods.filter(
        (p) =>
          p.denominationId === filter.denominationId &&
          p.year === year &&
          filter.congregationIds.includes(p.congregationId),
      ),
    );
  }

  sumContributions(
    filter: DataFilter,
    span: DateSpan,
  ): Promise<ContributionTypeSum[]> {
    const byType = new Map<number, { count: number; cents: number }>();
    for (const c of this.recorded(filter, span)) {
      const current = byType.get(c.contributionTypeId) ?? {
        count: 0,
        cents: 0,
      };
      byType.set(c.contributionTypeId, {
        count: current.count + 1,
        cents: current.cents + toCents(c.amount),
      });
    }
    return Promise.resolve(
      [...byType.entries()].map(([contributionTypeId, v]) => ({
        contributionTypeId,
        count: v.count,
        amount: fromCents(v.cents),
      })),
    );
  }

  sumPendingConsolidation(
    filter: DataFilter,
    span: DateSpan,
  ): Promise<PendingConsolidation> {
    const pending = this.recorded(filter, span).filter((c) => !c.consolidated);
    return Promise.resolve({
      count: pending.length,
      amount: fromCents(pending.reduce((sum, c) => sum + toCents(c.amount), 0)),
    });
  }

  sumContributionsByDay(
    filter: DataFilter,
    span: DateSpan,
  ): Promise<DailyAmount[]> {
    const byDay = new Map<string, number>();
    for (const c of this.recorded(filter, span)) {
      byDay.set(
        c.receivedOn,
        (byDay.get(c.receivedOn) ?? 0) + toCents(c.amount),
      );
    }
    return Promise.resolve(
      [...byDay.entries()].map(([date, cents]) => ({
        date,
        amount: fromCents(cents),
      })),
    );
  }

  countContributions(filter: DataFilter, span: DateSpan): Promise<number> {
    return Promise.resolve(this.recorded(filter, span).length);
  }

  listContributionDetail(
    filter: DataFilter,
    span: DateSpan,
    limit: number,
  ): Promise<ContributionDetailData[]> {
    return Promise.resolve(
      this.contributions
        .filter((c) => this.matches(c, filter, span))
        .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn) || a.id - b.id)
        .slice(0, limit)
        .map((c) => ({
          id: c.id,
          receivedOn: c.receivedOn,
          receipt: `REC-2026-${String(c.id).padStart(5, '0')}`,
          congregationName:
            this.congregations.find((x) => x.id === c.congregationId)?.name ??
            '',
          contributionType:
            this.contributionTypes.find((t) => t.id === c.contributionTypeId)
              ?.name ?? '',
          contributorName: c.contributorName,
          paymentMethod: 'CASH' as const,
          paymentReference: null,
          fundName: this.funds.find((f) => f.id === c.fundId)?.name ?? null,
          amount: c.amount,
          status: c.status,
        })),
    );
  }

  private recorded(filter: DataFilter, span: DateSpan): StoredContribution[] {
    return this.contributions.filter(
      (c) => c.status === 'RECORDED' && this.matches(c, filter, span),
    );
  }

  private matches(
    c: StoredContribution,
    filter: DataFilter,
    span: DateSpan,
  ): boolean {
    return (
      c.denominationId === filter.denominationId &&
      filter.congregationIds.includes(c.congregationId) &&
      (filter.fundId === null || c.fundId === filter.fundId) &&
      c.receivedOn >= span.from &&
      c.receivedOn <= span.to
    );
  }
}
