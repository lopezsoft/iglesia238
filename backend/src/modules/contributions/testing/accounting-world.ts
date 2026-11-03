import type {
  AuditEntry,
  AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import type { DocumentSequenceStore } from '../../../common/numbering/document-sequence.store.js';
import { type Page, buildPage } from '../../../common/pagination/page.js';
import type {
  Transaction,
  TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  fromCents,
  toCents,
} from '../../../common/accounting/accounting-rules.js';
import type {
  ContributionDetailRecord,
  ContributionRecord,
  ContributionTypeOption,
  PersonOption,
} from '../application/contribution.models.js';
import type {
  CategoryBreakdown,
  ContributionFilter,
  ContributionsRepository,
  ContributionTypeInfo,
  LockedVowPledge,
  NewContributionData,
  NewVoucherData,
  PeriodSummary,
} from '../application/contributions.repository.js';
import type {
  ContributorCandidate,
  ContributorSearch,
} from '../application/search-contributors.use-case.js';
import { toPersonOption } from '../application/search-contributors.use-case.js';
import type { CategoryTotal } from '../domain/contribution-rules.js';
import { shortPersonName } from '../domain/contribution-rules.js';
import type {
  ContributionCategory,
  ContributionStatus,
  PaymentMethod,
  PeriodStatus,
} from '../domain/contribution.types.js';
import type {
  VowPaymentRecord,
  VowPledgeDetailRecord,
  VowPledgeFigures,
  VowPledgeRecord,
  VowTypeOption,
} from '../../vows/application/vow-pledge.models.js';
import type {
  LockedPledge,
  NewVowPledgeData,
  VowPledgeChanges,
  VowPledgeFilter,
  VowsRepository,
  VowTypeInfo,
} from '../../vows/application/vows.repository.js';
import {
  type VowPledgeStatus,
  pledgeIdFromCode,
  vowPledgeStatusFor,
} from '../../vows/domain/vow-pledge-rules.js';
import { formatMemberCode } from '../../../common/numbering/document-numbering.service.js';

export interface WorldType {
  id: number;
  denominationId: number;
  name: string;
  category: ContributionCategory;
  isActive: boolean;
  accountUsable: boolean;
  fundName?: string | null;
}

export interface WorldPerson {
  id: number;
  denominationId: number;
  firstName: string;
  lastName: string;
  documentTypeCode: string | null;
  documentNumber: string | null;
  memberNumber: number | null;
  congregationId: number;
  deleted?: boolean;
  deceased?: boolean;
}

export interface WorldVoucher {
  id: number;
  denominationId: number;
  congregationId: number;
  type: string;
  number: number;
  issuedOn: string;
  voidedReason: string | null;
}

export interface WorldContribution {
  id: number;
  denominationId: number;
  congregationId: number;
  contributionTypeId: number;
  personId: number | null;
  vowPledgeId: number | null;
  voucherId: number | null;
  receivedOn: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentReference: string | null;
  notes: string | null;
  status: ContributionStatus;
  settled: boolean;
  consolidated: boolean;
  voidReason: string | null;
  recordedById: number;
  voidedById: number | null;
}

export interface WorldPledge {
  id: number;
  denominationId: number;
  congregationId: number;
  personId: number;
  contributionTypeId: number;
  description: string | null;
  pledgedAmount: number;
  pledgedOn: string;
  dueOn: string | null;
  status: VowPledgeStatus;
}

export interface WorldPeriod {
  denominationId: number;
  congregationId: number;
  year: number;
  month: number;
  status: PeriodStatus;
}

export interface WorldSettlement {
  denominationId: number;
  congregationId: number;
  from: string;
  to: string;
}

interface Snapshot {
  contributions: WorldContribution[];
  vouchers: WorldVoucher[];
  pledges: WorldPledge[];
  counters: Map<string, number>;
}

const inScope = (
  scope: TenantScope,
  row: { denominationId: number; congregationId: number },
): boolean =>
  row.denominationId === scope.denominationId &&
  (scope.congregationId === null ||
    row.congregationId === scope.congregationId);

/** Sequence counters shared by the numbering service and the repositories that peek at them. */
export class FakeSequenceStore implements DocumentSequenceStore {
  readonly counters = new Map<string, number>();

  next(scope: TenantScope, key: string): Promise<number> {
    const id = this.idOf(scope, key);
    const value = (this.counters.get(id) ?? 0) + 1;
    this.counters.set(id, value);
    return Promise.resolve(value);
  }

  peek(scope: TenantScope, key: string): number {
    return this.counters.get(this.idOf(scope, key)) ?? 0;
  }

  private idOf(scope: TenantScope, key: string): string {
    return `${scope.denominationId}/${scope.congregationId}/${key}`;
  }
}

export class FakeAuditRecorder implements AuditRecorder {
  readonly entries: AuditEntry[] = [];
  failWith: Error | null = null;

  record(entry: AuditEntry): Promise<void> {
    if (this.failWith) {
      return Promise.reject(this.failWith);
    }
    this.entries.push(entry);
    return Promise.resolve();
  }
}

export class FixedClock extends Clock {
  constructor(private readonly day = '2026-11-02') {
    super();
  }
  now(): Date {
    return new Date(`${this.day}T15:00:00.000Z`);
  }
}

/** The in-memory database of the accounting tests: tables, tenancy filters and rollback. */
export class AccountingWorld {
  readonly sequences = new FakeSequenceStore();
  readonly congregations = new Map<
    number,
    { id: number; denominationId: number; name: string; code: string }
  >();
  readonly types: WorldType[] = [];
  readonly persons: WorldPerson[] = [];
  readonly periods: WorldPeriod[] = [];
  readonly settlements: WorldSettlement[] = [];
  contributions: WorldContribution[] = [];
  vouchers: WorldVoucher[] = [];
  pledges: WorldPledge[] = [];
  private nextId = 100;

  readonly transactions: TransactionRunner = {
    run: async <T>(work: (transaction: Transaction) => Promise<T>) => {
      const before = this.snapshot();
      try {
        return await work({ kind: 'transaction' });
      } catch (error) {
        this.restore(before);
        throw error;
      }
    },
  };

  id(): number {
    this.nextId += 1;
    return this.nextId;
  }

  paidOf(pledgeId: number): number {
    return fromCents(
      this.contributions
        .filter((c) => c.vowPledgeId === pledgeId && c.status === 'RECORDED')
        .reduce((sum, c) => sum + toCents(c.amount), 0),
    );
  }

  private snapshot(): Snapshot {
    return structuredClone({
      contributions: this.contributions,
      vouchers: this.vouchers,
      pledges: this.pledges,
      counters: this.sequences.counters,
    });
  }

  private restore(snapshot: Snapshot): void {
    this.contributions = snapshot.contributions;
    this.vouchers = snapshot.vouchers;
    this.pledges = snapshot.pledges;
    this.sequences.counters.clear();
    for (const [key, value] of snapshot.counters) {
      this.sequences.counters.set(key, value);
    }
  }
}

export class FakeContributionsRepository implements ContributionsRepository {
  constructor(private readonly world: AccountingWorld) {}

  congregationName(scope: TenantScope): Promise<string | null> {
    const congregation = this.world.congregations.get(
      scope.congregationId ?? -1,
    );
    return Promise.resolve(
      congregation?.denominationId === scope.denominationId
        ? congregation.name
        : null,
    );
  }

  listActiveTypes(scope: TenantScope): Promise<ContributionTypeOption[]> {
    return Promise.resolve(
      this.world.types
        .filter((t) => t.denominationId === scope.denominationId && t.isActive)
        .map(({ id, name, category }) => ({ id, name, category })),
    );
  }

  findType(
    scope: TenantScope,
    typeId: number,
  ): Promise<ContributionTypeInfo | null> {
    const type = this.world.types.find(
      (t) => t.id === typeId && t.denominationId === scope.denominationId,
    );
    return Promise.resolve(type ? { ...type } : null);
  }

  listPeriods(scope: TenantScope): Promise<PeriodSummary[]> {
    return Promise.resolve(
      this.world.periods
        .filter((p) => inScope(scope, p))
        .map(({ year, month, status }) => ({ year, month, status })),
    );
  }

  findPeriod(
    scope: TenantScope,
    year: number,
    month: number,
  ): Promise<PeriodSummary | null> {
    const period = this.world.periods.find(
      (p) => inScope(scope, p) && p.year === year && p.month === month,
    );
    return Promise.resolve(
      period ? { year, month, status: period.status } : null,
    );
  }

  listIssuedTitheRanges(scope: TenantScope) {
    return Promise.resolve(
      this.world.settlements
        .filter((s) => inScope(scope, s))
        .map(({ from, to }) => ({ from, to })),
    );
  }

  peekNextReceiptNumber(scope: TenantScope): Promise<number> {
    return Promise.resolve(this.world.sequences.peek(scope, 'VOUCHER:REC') + 1);
  }

  personExists(scope: TenantScope, personId: number): Promise<boolean> {
    return Promise.resolve(
      this.world.persons.some(
        (p) =>
          p.id === personId &&
          p.denominationId === scope.denominationId &&
          !p.deleted,
      ),
    );
  }

  findPage(
    scope: TenantScope,
    filter: ContributionFilter,
    page: { page: number; pageSize: number },
  ): Promise<Page<ContributionRecord>> {
    const rows = this.matching(scope, filter, 'all')
      .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.id - a.id)
      .map((c) => this.recordOf(c));
    const start = (page.page - 1) * page.pageSize;
    return Promise.resolve(
      buildPage(rows.slice(start, start + page.pageSize), rows.length, page),
    );
  }

  breakdown(
    scope: TenantScope,
    filter: ContributionFilter,
  ): Promise<CategoryBreakdown> {
    const totals = new Map<ContributionCategory, CategoryTotal>();
    for (const c of this.matching(scope, filter, 'valid')) {
      const category = this.typeOf(c.contributionTypeId).category;
      const current = totals.get(category) ?? { category, amount: 0, count: 0 };
      totals.set(category, {
        category,
        amount: fromCents(toCents(current.amount) + toCents(c.amount)),
        count: current.count + 1,
      });
    }
    return Promise.resolve({
      totals: [...totals.values()],
      voidedCount: this.matching(scope, filter, 'voided').length,
    });
  }

  findAll(scope: TenantScope, filter: ContributionFilter, limit: number) {
    return Promise.resolve(
      this.matching(scope, filter, 'all')
        .slice(0, limit)
        .map((c) => this.recordOf(c)),
    );
  }

  findById(
    scope: TenantScope,
    id: number,
  ): Promise<ContributionDetailRecord | null> {
    const row = this.world.contributions.find(
      (c) => c.id === id && inScope(scope, c),
    );
    return Promise.resolve(
      row
        ? {
            ...this.recordOf(row),
            recordedAt: '2026-11-02T15:00:00.000Z',
            recordedByName: 'Tesorera',
            voidedAt:
              row.status === 'VOIDED' ? '2026-11-02T16:00:00.000Z' : null,
            voidedByName: row.status === 'VOIDED' ? 'Tesorera' : null,
            consolidationNumber: null,
            consolidationIssuedOn: null,
            settlementId: row.settled ? 1 : null,
          }
        : null,
    );
  }

  lockVowPledge(
    scope: TenantScope,
    pledgeId: number,
  ): Promise<LockedVowPledge | null> {
    const pledge = this.world.pledges.find(
      (p) => p.id === pledgeId && p.denominationId === scope.denominationId,
    );
    return Promise.resolve(
      pledge ? { ...pledge, paid: this.world.paidOf(pledge.id) } : null,
    );
  }

  createVoucher(scope: TenantScope, data: NewVoucherData): Promise<number> {
    const id = this.world.id();
    this.world.vouchers.push({
      id,
      denominationId: scope.denominationId,
      congregationId: scope.requireCongregationId(),
      voidedReason: null,
      ...data,
    });
    return Promise.resolve(id);
  }

  createContribution(
    scope: TenantScope,
    data: NewContributionData,
  ): Promise<number> {
    const id = this.world.id();
    this.world.contributions.push({
      id,
      denominationId: scope.denominationId,
      congregationId: scope.requireCongregationId(),
      status: 'RECORDED',
      settled: false,
      consolidated: false,
      voidReason: null,
      voidedById: null,
      ...data,
    });
    return Promise.resolve(id);
  }

  markVoided(
    scope: TenantScope,
    id: number,
    voidedById: number,
    reason: string,
  ): Promise<boolean> {
    const row = this.world.contributions.find(
      (c) => c.id === id && inScope(scope, c),
    );
    if (!row || row.status !== 'RECORDED' || row.settled || row.consolidated) {
      return Promise.resolve(false);
    }
    Object.assign(row, { status: 'VOIDED', voidedById, voidReason: reason });
    return Promise.resolve(true);
  }

  voidVoucher(
    scope: TenantScope,
    voucherId: number,
    reason: string,
  ): Promise<void> {
    const voucher = this.world.vouchers.find(
      (v) => v.id === voucherId && inScope(scope, v),
    );
    if (voucher) {
      voucher.voidedReason = reason;
    }
    return Promise.resolve();
  }

  refreshVowPledgeStatus(
    scope: TenantScope,
    pledgeId: number,
  ): Promise<VowPledgeStatus> {
    return Promise.resolve(refreshPledge(this.world, scope, pledgeId));
  }

  /** Test helper: contributions of the world as the tests read them. */
  all(): WorldContribution[] {
    return this.world.contributions;
  }

  private typeOf(typeId: number): WorldType {
    const type = this.world.types.find((t) => t.id === typeId);
    if (!type) {
      throw new Error(`Unknown type ${typeId}`);
    }
    return type;
  }

  private matching(
    scope: TenantScope,
    filter: ContributionFilter,
    mode: 'all' | 'valid' | 'voided',
  ): WorldContribution[] {
    const search = filter.search?.toLowerCase();
    return this.world.contributions.filter((c) => {
      if (
        !inScope(scope, c) ||
        c.receivedOn < filter.from ||
        c.receivedOn > filter.to
      ) {
        return false;
      }
      const display =
        c.status === 'VOIDED' ? 'VOIDED' : c.settled ? 'SETTLED' : 'RECORDED';
      if (filter.status && display !== filter.status) {
        return false;
      }
      if (mode === 'valid' && c.status !== 'RECORDED') {
        return false;
      }
      if (mode === 'voided' && c.status !== 'VOIDED') {
        return false;
      }
      if (
        filter.category &&
        this.typeOf(c.contributionTypeId).category !== filter.category
      ) {
        return false;
      }
      if (
        filter.contributionTypeId !== undefined &&
        c.contributionTypeId !== filter.contributionTypeId
      ) {
        return false;
      }
      if (filter.paymentMethod && c.paymentMethod !== filter.paymentMethod) {
        return false;
      }
      if (search) {
        const person = this.world.persons.find((p) => p.id === c.personId);
        const haystack = [
          c.paymentReference,
          c.notes,
          person?.firstName,
          person?.lastName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      return true;
    });
  }

  private recordOf(c: WorldContribution): ContributionRecord {
    const type = this.typeOf(c.contributionTypeId);
    const person = this.world.persons.find((p) => p.id === c.personId);
    const voucher = this.world.vouchers.find((v) => v.id === c.voucherId);
    const pledge = this.world.pledges.find((p) => p.id === c.vowPledgeId);
    const congregation = this.world.congregations.get(c.congregationId);
    return {
      id: c.id,
      congregationId: c.congregationId,
      congregationName: congregation?.name ?? '—',
      voucherId: c.voucherId,
      receiptNumber: voucher?.number ?? null,
      receivedOn: c.receivedOn,
      contributionTypeId: c.contributionTypeId,
      typeName: type.name,
      category: type.category,
      personId: c.personId,
      contributorName: person
        ? shortPersonName({
            firstName: person.firstName,
            lastName: person.lastName,
            fullName: null,
          })
        : null,
      memberCode:
        person && person.memberNumber !== null
          ? formatMemberCode(
              this.world.congregations.get(person.congregationId)?.code ?? 'XX',
              person.memberNumber,
            )
          : null,
      vowPledgeId: c.vowPledgeId,
      vowPledgedOn: pledge?.pledgedOn ?? null,
      paymentMethod: c.paymentMethod,
      paymentReference: c.paymentReference,
      notes: c.notes,
      amount: c.amount,
      status: c.status,
      settled: c.settled,
      consolidated: c.consolidated,
      voidReason: c.voidReason,
    };
  }
}

function refreshPledge(
  world: AccountingWorld,
  scope: TenantScope,
  pledgeId: number,
): VowPledgeStatus {
  const pledge = world.pledges.find(
    (p) => p.id === pledgeId && p.denominationId === scope.denominationId,
  );
  if (!pledge) {
    throw new Error('Pledge not found while refreshing its status');
  }
  pledge.status = vowPledgeStatusFor(
    pledge.status,
    pledge.pledgedAmount,
    world.paidOf(pledge.id),
  );
  return pledge.status;
}

/** Stands for SearchPeople (purpose CONTRIBUTOR): same filters, preferred sede first, document masked. */
export class FakeContributorsRepository implements ContributorSearch {
  constructor(private readonly world: AccountingWorld) {}

  search(
    scope: TenantScope,
    query: string,
    limit: number,
    preferredCongregationId: number | null,
  ): Promise<PersonOption[]> {
    const text = query.toLowerCase();
    return Promise.resolve(
      this.world.persons
        .filter(
          (p) =>
            p.denominationId === scope.denominationId &&
            !p.deleted &&
            !p.deceased &&
            p.memberNumber !== null &&
            `${p.firstName} ${p.lastName}`.toLowerCase().includes(text),
        )
        .sort(
          (a, b) =>
            Number(b.congregationId === preferredCongregationId) -
            Number(a.congregationId === preferredCongregationId),
        )
        .slice(0, limit)
        .map((p) => toPersonOption(this.candidateOf(p))),
    );
  }

  candidateOf(p: WorldPerson): ContributorCandidate {
    const congregation = this.world.congregations.get(p.congregationId);
    return {
      personId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      fullName: null,
      documentTypeCode: p.documentTypeCode,
      documentNumber: p.documentNumber,
      memberNumber: p.memberNumber,
      congregationId: p.congregationId,
      congregationCode: congregation?.code ?? null,
      congregationName: congregation?.name ?? '—',
    };
  }
}

export class FakeVowsRepository implements VowsRepository {
  private readonly contributors: FakeContributorsRepository;

  constructor(private readonly world: AccountingWorld) {
    this.contributors = new FakeContributorsRepository(world);
  }

  congregationName(scope: TenantScope): Promise<string | null> {
    const congregation = this.world.congregations.get(
      scope.congregationId ?? -1,
    );
    return Promise.resolve(
      congregation?.denominationId === scope.denominationId
        ? congregation.name
        : null,
    );
  }

  listVowTypes(scope: TenantScope): Promise<VowTypeOption[]> {
    return Promise.resolve(
      this.world.types
        .filter(
          (t) =>
            t.denominationId === scope.denominationId &&
            t.category === 'VOW' &&
            t.isActive,
        )
        .map(({ id, name }) => ({ id, name })),
    );
  }

  findType(scope: TenantScope, typeId: number): Promise<VowTypeInfo | null> {
    const type = this.world.types.find(
      (t) => t.id === typeId && t.denominationId === scope.denominationId,
    );
    return Promise.resolve(
      type
        ? { id: type.id, category: type.category, isActive: type.isActive }
        : null,
    );
  }

  personExists(scope: TenantScope, personId: number): Promise<boolean> {
    return Promise.resolve(
      this.world.persons.some(
        (p) =>
          p.id === personId &&
          p.denominationId === scope.denominationId &&
          !p.deleted,
      ),
    );
  }

  findPage(
    scope: TenantScope,
    filter: VowPledgeFilter,
    page: { page: number; pageSize: number },
  ): Promise<Page<VowPledgeRecord>> {
    const rows = this.matching(scope, filter).map((p) => this.recordOf(p));
    const start = (page.page - 1) * page.pageSize;
    return Promise.resolve(
      buildPage(rows.slice(start, start + page.pageSize), rows.length, page),
    );
  }

  findAll(scope: TenantScope, filter: VowPledgeFilter, limit: number) {
    return Promise.resolve(
      this.matching(scope, filter)
        .slice(0, limit)
        .map((p) => this.recordOf(p)),
    );
  }

  statusCounts(scope: TenantScope): Promise<Record<VowPledgeStatus, number>> {
    const counts: Record<VowPledgeStatus, number> = {
      ACTIVE: 0,
      FULFILLED: 0,
      CANCELLED: 0,
    };
    for (const pledge of this.world.pledges.filter((p) => inScope(scope, p))) {
      counts[pledge.status] += 1;
    }
    return Promise.resolve(counts);
  }

  listFigures(scope: TenantScope): Promise<VowPledgeFigures[]> {
    return Promise.resolve(
      this.world.pledges
        .filter((p) => inScope(scope, p) && p.status !== 'CANCELLED')
        .map((p) => ({
          id: p.id,
          pledgedAmount: p.pledgedAmount,
          pledgedOn: p.pledgedOn,
          dueOn: p.dueOn,
          status: p.status,
          paid: this.world.paidOf(p.id),
          lastPaymentOn: this.lastPaymentOn(p.id),
        })),
    );
  }

  findById(
    scope: TenantScope,
    id: number,
  ): Promise<VowPledgeDetailRecord | null> {
    const pledge = this.world.pledges.find(
      (p) => p.id === id && inScope(scope, p),
    );
    if (!pledge) {
      return Promise.resolve(null);
    }
    const person = this.world.persons.find((p) => p.id === pledge.personId);
    const payments: VowPaymentRecord[] = this.world.contributions
      .filter(
        (c) =>
          c.vowPledgeId === id && c.denominationId === scope.denominationId,
      )
      .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.id - a.id)
      .map((c) => ({
        id: c.id,
        receivedOn: c.receivedOn,
        receiptNumber:
          this.world.vouchers.find((v) => v.id === c.voucherId)?.number ?? null,
        amount: c.amount,
        paymentMethod: c.paymentMethod,
        status:
          c.status === 'VOIDED'
            ? ('VOIDED' as const)
            : c.settled
              ? ('SETTLED' as const)
              : ('RECORDED' as const),
        congregationName:
          this.world.congregations.get(c.congregationId)?.name ?? '—',
      }));
    return Promise.resolve({
      ...this.recordOf(pledge),
      documentTypeCode: person?.documentTypeCode ?? null,
      documentNumber: person?.documentNumber ?? null,
      fundName:
        this.world.types.find((t) => t.id === pledge.contributionTypeId)
          ?.fundName ?? null,
      payments,
      cancelReason: null,
    });
  }

  findActive(scope: TenantScope, personId: number, contributionTypeId: number) {
    return Promise.resolve(
      this.world.pledges
        .filter(
          (p) =>
            p.denominationId === scope.denominationId &&
            p.personId === personId &&
            p.contributionTypeId === contributionTypeId &&
            p.status === 'ACTIVE',
        )
        .map((p) => this.recordOf(p)),
    );
  }

  findContributor(
    scope: TenantScope,
    personId: number,
  ): Promise<ContributorCandidate | null> {
    const person = this.world.persons.find(
      (p) =>
        p.id === personId &&
        p.denominationId === scope.denominationId &&
        !p.deleted,
    );
    return Promise.resolve(
      person ? this.contributors.candidateOf(person) : null,
    );
  }

  create(scope: TenantScope, data: NewVowPledgeData): Promise<number> {
    const id = this.world.id();
    this.world.pledges.push({
      id,
      denominationId: scope.denominationId,
      congregationId: scope.requireCongregationId(),
      status: 'ACTIVE',
      ...data,
    });
    return Promise.resolve(id);
  }

  lock(scope: TenantScope, id: number): Promise<LockedPledge | null> {
    const pledge = this.world.pledges.find(
      (p) => p.id === id && inScope(scope, p),
    );
    return Promise.resolve(
      pledge ? { ...pledge, paid: this.world.paidOf(id) } : null,
    );
  }

  cancel(scope: TenantScope, id: number): Promise<boolean> {
    const pledge = this.world.pledges.find(
      (p) => p.id === id && inScope(scope, p),
    );
    if (!pledge || pledge.status !== 'ACTIVE') {
      return Promise.resolve(false);
    }
    pledge.status = 'CANCELLED';
    return Promise.resolve(true);
  }

  update(
    scope: TenantScope,
    id: number,
    changes: VowPledgeChanges,
  ): Promise<void> {
    const pledge = this.world.pledges.find(
      (p) => p.id === id && inScope(scope, p),
    );
    if (pledge) {
      if (changes.pledgedAmount !== undefined)
        pledge.pledgedAmount = changes.pledgedAmount;
      if (changes.dueOn !== undefined) pledge.dueOn = changes.dueOn;
      if (changes.description !== undefined)
        pledge.description = changes.description;
    }
    return Promise.resolve();
  }

  refreshStatus(scope: TenantScope, id: number): Promise<VowPledgeStatus> {
    return Promise.resolve(refreshPledge(this.world, scope, id));
  }

  private lastPaymentOn(pledgeId: number): string | null {
    return this.world.contributions
      .filter((c) => c.vowPledgeId === pledgeId && c.status === 'RECORDED')
      .reduce<string | null>(
        (last, c) =>
          last === null || c.receivedOn > last ? c.receivedOn : last,
        null,
      );
  }

  private matching(scope: TenantScope, filter: VowPledgeFilter): WorldPledge[] {
    const search = filter.search?.toLowerCase();
    const code = filter.search ? pledgeIdFromCode(filter.search) : null;
    return this.world.pledges
      .filter((p) => {
        if (!inScope(scope, p)) return false;
        if (filter.status && p.status !== filter.status) return false;
        if (
          filter.contributionTypeId !== undefined &&
          p.contributionTypeId !== filter.contributionTypeId
        )
          return false;
        if (
          filter.overdueOnly &&
          !(
            p.status === 'ACTIVE' &&
            p.dueOn !== null &&
            filter.today &&
            p.dueOn < filter.today
          )
        )
          return false;
        if (search) {
          const person = this.world.persons.find((x) => x.id === p.personId);
          const name =
            `${person?.firstName ?? ''} ${person?.lastName ?? ''}`.toLowerCase();
          if (!name.includes(search) && p.id !== code) return false;
        }
        return true;
      })
      .sort((a, b) => b.pledgedOn.localeCompare(a.pledgedOn) || b.id - a.id);
  }

  private recordOf(p: WorldPledge): VowPledgeRecord {
    const person = this.world.persons.find((x) => x.id === p.personId);
    const payments = this.world.contributions.filter(
      (c) => c.vowPledgeId === p.id && c.status === 'RECORDED',
    );
    return {
      id: p.id,
      congregationId: p.congregationId,
      congregationName:
        this.world.congregations.get(p.congregationId)?.name ?? '—',
      personId: p.personId,
      personName: person
        ? (shortPersonName({
            firstName: person.firstName,
            lastName: person.lastName,
            fullName: null,
          }) ?? '—')
        : '—',
      memberCode:
        person && person.memberNumber !== null
          ? formatMemberCode(
              this.world.congregations.get(person.congregationId)?.code ?? 'XX',
              person.memberNumber,
            )
          : null,
      contributionTypeId: p.contributionTypeId,
      typeName:
        this.world.types.find((t) => t.id === p.contributionTypeId)?.name ??
        'Voto',
      description: p.description,
      pledgedAmount: p.pledgedAmount,
      pledgedOn: p.pledgedOn,
      dueOn: p.dueOn,
      storedStatus: p.status,
      paid: this.world.paidOf(p.id),
      paymentCount: payments.length,
      lastPaymentOn: this.lastPaymentOn(p.id),
    };
  }
}
