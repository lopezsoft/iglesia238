import type {
  AccountData,
  AccountFacts,
  AccountRecord,
  AccountRepository,
} from '../../src/modules/accounting-setup/application/account.repository.js';
import type {
  ContributionTypeData,
  ContributionTypeRecord,
  ContributionTypeRepository,
} from '../../src/modules/accounting-setup/application/contribution-type.repository.js';
import {
  EMPTY_FUND_FACTS,
  type FundFacts,
  type FundRecord,
  type FundRepository,
} from '../../src/modules/accounting-setup/application/fund.repository.js';
import type { PeriodRepository } from '../../src/modules/accounting-setup/application/period.repository.js';
import type {
  TitheRuleData,
  TitheRuleRecord,
  TitheRuleRepository,
} from '../../src/modules/accounting-setup/application/tithe-rule.repository.js';
import type { PeriodRecord } from '../../src/common/accounting/period-view.js';
import type { CongregationLookup } from '../../src/common/accounting/congregation-lookup.port.js';
import type { TenantScope } from '../../src/common/tenancy/tenant-scope.js';

/** In-memory funds that filter by denomination exactly as the Prisma repository does. */
export class InMemoryFundRepository implements FundRepository {
  readonly funds: FundRecord[] = [];
  /** Facts a test sets by hand (movements, budget lines...), by fund id. */
  readonly facts_ = new Map<number, Partial<FundFacts>>();
  readonly openings = new Map<string, number>();
  private nextId = 1;

  add(denominationId: number, name: string, isActive = true): FundRecord {
    const fund = { id: this.nextId++, denominationId, name, isActive };
    this.funds.push(fund);
    return fund;
  }

  setFacts(fundId: number, facts: Partial<FundFacts>): void {
    this.facts_.set(fundId, { ...this.facts_.get(fundId), ...facts });
  }

  openingOf(congregationId: number, fundId: number, year: number): number {
    return this.openings.get(`${congregationId}:${fundId}:${year}`) ?? 0;
  }

  list(scope: TenantScope): Promise<FundRecord[]> {
    return Promise.resolve(
      this.funds.filter((f) => f.denominationId === scope.denominationId),
    );
  }

  find(scope: TenantScope, id: number): Promise<FundRecord | null> {
    return Promise.resolve(
      this.funds.find(
        (f) => f.id === id && f.denominationId === scope.denominationId,
      ) ?? null,
    );
  }

  facts(
    scope: TenantScope,
    year: number,
    fundIds?: readonly number[],
  ): Promise<ReadonlyMap<number, FundFacts>> {
    const result = new Map<number, FundFacts>();
    for (const fund of this.funds) {
      if (
        fund.denominationId !== scope.denominationId ||
        (fundIds && !fundIds.includes(fund.id))
      ) {
        continue;
      }
      let opening = 0;
      for (const [key, amount] of this.openings) {
        const [congregation, fundId, openingYear] = key.split(':').map(Number);
        if (
          fundId === fund.id &&
          openingYear === year &&
          (scope.congregationId === null ||
            congregation === scope.congregationId)
        ) {
          opening += amount;
        }
      }
      result.set(fund.id, {
        ...EMPTY_FUND_FACTS,
        openingBalance: opening,
        ...this.facts_.get(fund.id),
      });
    }
    return Promise.resolve(result);
  }

  create(
    scope: TenantScope,
    data: { name: string; isActive: boolean },
  ): Promise<FundRecord> {
    return Promise.resolve(
      this.add(scope.denominationId, data.name, data.isActive),
    );
  }

  update(
    scope: TenantScope,
    id: number,
    data: { name: string; isActive: boolean },
  ): Promise<FundRecord> {
    const index = this.funds.findIndex(
      (f) => f.id === id && f.denominationId === scope.denominationId,
    );
    this.funds[index] = { ...this.funds[index], ...data };
    return Promise.resolve(this.funds[index]);
  }

  delete(scope: TenantScope, id: number): Promise<void> {
    const index = this.funds.findIndex(
      (f) => f.id === id && f.denominationId === scope.denominationId,
    );
    this.funds.splice(index, 1);
    return Promise.resolve();
  }

  getOpeningBalance(
    scope: TenantScope,
    fundId: number,
    year: number,
  ): Promise<number> {
    return Promise.resolve(
      this.openingOf(scope.requireCongregationId(), fundId, year),
    );
  }

  setOpeningBalance(
    scope: TenantScope,
    fundId: number,
    year: number,
    amount: number,
  ): Promise<void> {
    this.openings.set(
      `${scope.requireCongregationId()}:${fundId}:${year}`,
      amount,
    );
    return Promise.resolve();
  }

  deleteOpeningBalances(scope: TenantScope, fundId: number): Promise<void> {
    for (const key of [...this.openings.keys()]) {
      if (Number(key.split(':')[1]) === fundId) {
        this.openings.delete(key);
      }
    }
    return Promise.resolve();
  }
}

export class InMemoryAccountRepository implements AccountRepository {
  readonly accounts: AccountRecord[] = [];
  readonly factsById = new Map<number, Partial<AccountFacts>>();
  private nextId = 1;

  add(
    denominationId: number,
    code: string,
    overrides: Partial<AccountRecord> = {},
  ): AccountRecord {
    const account: AccountRecord = {
      id: this.nextId++,
      denominationId,
      defaultFundId: null,
      parentId: null,
      code,
      legacyCode: null,
      name: `Cuenta ${code}`,
      nature: 'INCOME',
      isPostable: true,
      isActive: true,
      ...overrides,
    };
    this.accounts.push(account);
    return account;
  }

  setFacts(accountId: number, facts: Partial<AccountFacts>): void {
    this.factsById.set(accountId, {
      ...this.factsById.get(accountId),
      ...facts,
    });
  }

  list(scope: TenantScope): Promise<AccountRecord[]> {
    return Promise.resolve(
      this.accounts.filter((a) => a.denominationId === scope.denominationId),
    );
  }

  find(scope: TenantScope, id: number): Promise<AccountRecord | null> {
    return Promise.resolve(
      this.accounts.find(
        (a) => a.id === id && a.denominationId === scope.denominationId,
      ) ?? null,
    );
  }

  facts(scope: TenantScope): Promise<ReadonlyMap<number, AccountFacts>> {
    const result = new Map<number, AccountFacts>();
    for (const account of this.accounts) {
      if (account.denominationId === scope.denominationId) {
        result.set(account.id, {
          hasMovements: false,
          linkedTypes: 0,
          activeLinkedTypes: 0,
          ...this.factsById.get(account.id),
        });
      }
    }
    return Promise.resolve(result);
  }

  create(scope: TenantScope, data: AccountData): Promise<AccountRecord> {
    return Promise.resolve(
      this.add(scope.denominationId, data.code, {
        parentId: data.parentId,
        name: data.name,
        nature: data.nature,
        isPostable: data.isPostable,
        defaultFundId: data.defaultFundId,
      }),
    );
  }

  update(
    scope: TenantScope,
    id: number,
    data: Partial<AccountRecord>,
  ): Promise<AccountRecord> {
    const index = this.accounts.findIndex(
      (a) => a.id === id && a.denominationId === scope.denominationId,
    );
    this.accounts[index] = { ...this.accounts[index], ...data };
    return Promise.resolve(this.accounts[index]);
  }

  delete(scope: TenantScope, id: number): Promise<void> {
    const index = this.accounts.findIndex(
      (a) => a.id === id && a.denominationId === scope.denominationId,
    );
    this.accounts.splice(index, 1);
    return Promise.resolve();
  }
}

export class InMemoryContributionTypeRepository implements ContributionTypeRepository {
  readonly types: ContributionTypeRecord[] = [];
  private nextId = 1;

  constructor(private readonly accounts: InMemoryAccountRepository) {}

  add(
    denominationId: number,
    code: string,
    accountId: number,
    overrides: Partial<ContributionTypeRecord> = {},
  ): ContributionTypeRecord {
    const account = this.accounts.accounts.find((a) => a.id === accountId);
    const type: ContributionTypeRecord = {
      id: this.nextId++,
      denominationId,
      category: 'OFFERING',
      code,
      name: `Tipo ${code}`,
      accountId,
      isActive: true,
      accountCode: account?.code ?? '—',
      accountName: account?.name ?? '—',
      contributionCount: 0,
      ...overrides,
    };
    this.types.push(type);
    return type;
  }

  list(scope: TenantScope): Promise<ContributionTypeRecord[]> {
    return Promise.resolve(
      this.types.filter((t) => t.denominationId === scope.denominationId),
    );
  }

  find(scope: TenantScope, id: number): Promise<ContributionTypeRecord | null> {
    return Promise.resolve(
      this.types.find(
        (t) => t.id === id && t.denominationId === scope.denominationId,
      ) ?? null,
    );
  }

  create(scope: TenantScope, data: ContributionTypeData): Promise<number> {
    return Promise.resolve(
      this.add(scope.denominationId, data.code, data.accountId, {
        name: data.name,
        category: data.category,
      }).id,
    );
  }

  update(
    scope: TenantScope,
    id: number,
    data: ContributionTypeData,
  ): Promise<void> {
    const index = this.types.findIndex(
      (t) => t.id === id && t.denominationId === scope.denominationId,
    );
    const account = this.accounts.accounts.find((a) => a.id === data.accountId);
    this.types[index] = {
      ...this.types[index],
      ...data,
      accountCode: account?.code ?? '—',
      accountName: account?.name ?? '—',
    };
    return Promise.resolve();
  }

  setActive(scope: TenantScope, id: number, isActive: boolean): Promise<void> {
    const index = this.types.findIndex(
      (t) => t.id === id && t.denominationId === scope.denominationId,
    );
    this.types[index] = { ...this.types[index], isActive };
    return Promise.resolve();
  }
}

/** Periods of the congregations, keyed by the congregation in the scope. */
export class InMemoryPeriodRepository implements PeriodRepository {
  readonly periods: (PeriodRecord & {
    denominationId: number;
    congregationId: number;
  })[] = [];
  private nextId = 1;

  add(
    scope: TenantScope,
    year: number,
    month: number,
    status: 'OPEN' | 'CLOSED' = 'OPEN',
  ): PeriodRecord {
    const period = {
      id: this.nextId++,
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

  list(scope: TenantScope): Promise<PeriodRecord[]> {
    return Promise.resolve(
      this.periods
        .filter(
          (p) =>
            p.denominationId === scope.denominationId &&
            p.congregationId === scope.requireCongregationId(),
        )
        .toSorted((a, b) => b.year - a.year || b.month - a.month),
    );
  }

  create(
    scope: TenantScope,
    data: { year: number; month: number },
  ): Promise<PeriodRecord> {
    return Promise.resolve(this.add(scope, data.year, data.month));
  }
}

export class InMemoryTitheRuleRepository implements TitheRuleRepository {
  readonly rules: TitheRuleRecord[] = [];
  /** Settled dates of issued settlements, by denomination. */
  readonly settlements: { denominationId: number; settledOn: string }[] = [];
  private nextId = 1;

  add(denominationId: number, data: TitheRuleData): TitheRuleRecord {
    const rule = { id: this.nextId++, denominationId, ...data };
    this.rules.push(rule);
    return rule;
  }

  list(scope: TenantScope): Promise<TitheRuleRecord[]> {
    return Promise.resolve(
      this.rules
        .filter((r) => r.denominationId === scope.denominationId)
        .toSorted((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    );
  }

  find(scope: TenantScope, id: number): Promise<TitheRuleRecord | null> {
    return Promise.resolve(
      this.rules.find(
        (r) => r.id === id && r.denominationId === scope.denominationId,
      ) ?? null,
    );
  }

  create(scope: TenantScope, data: TitheRuleData): Promise<TitheRuleRecord> {
    return Promise.resolve(this.add(scope.denominationId, data));
  }

  update(
    scope: TenantScope,
    id: number,
    data: TitheRuleData,
  ): Promise<TitheRuleRecord> {
    const index = this.rules.findIndex(
      (r) => r.id === id && r.denominationId === scope.denominationId,
    );
    this.rules[index] = { ...this.rules[index], ...data };
    return Promise.resolve(this.rules[index]);
  }

  delete(scope: TenantScope, id: number): Promise<void> {
    const index = this.rules.findIndex(
      (r) => r.id === id && r.denominationId === scope.denominationId,
    );
    this.rules.splice(index, 1);
    return Promise.resolve();
  }

  countIssuedSettlements(
    scope: TenantScope,
    from: string,
    toExclusive: string | null,
  ): Promise<number> {
    return Promise.resolve(
      this.settlements.filter(
        (s) =>
          s.denominationId === scope.denominationId &&
          s.settledOn >= from &&
          (toExclusive === null || s.settledOn < toExclusive),
      ).length,
    );
  }
}

export class FakeCongregationLookup implements CongregationLookup {
  constructor(private readonly names: ReadonlyMap<number, string>) {}

  nameOf(_scope: TenantScope, congregationId: number): Promise<string | null> {
    return Promise.resolve(this.names.get(congregationId) ?? null);
  }
}
