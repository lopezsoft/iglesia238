import {
  fromCents,
  toCents,
} from '../../../../common/accounting/accounting-rules.js';
import type {
  AuditEntry,
  AuditRecorder,
} from '../../../../common/audit/audit-recorder.port.js';
import type {
  Transaction,
  TransactionRunner,
} from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import type {
  AccountData,
  BudgetData,
  BudgetHead,
  BudgetLineData,
  BudgetStatusValue,
  BudgetTypeValue,
  ExecutionRow,
  FundData,
  LineWithBudget,
  MovementData,
} from '../budget.models.js';
import type {
  BudgetReader,
  BudgetWriter,
  LineValues,
} from '../budget.ports.js';

export class FakeClock extends Clock {
  constructor(private readonly current: string) {
    super();
  }

  now(): Date {
    return new Date(`${this.current}T12:00:00-05:00`);
  }
}

export class FakeTransactionRunner implements TransactionRunner {
  run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    return work({ kind: 'transaction' });
  }
}

export class FakeAudit implements AuditRecorder {
  readonly entries: AuditEntry[] = [];

  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

type StoredBudget = Mutable<BudgetHead> & {
  denominationId: number;
  congregationId: number;
};

interface StoredLine {
  id: number;
  denominationId: number;
  budgetId: number;
  accountId: number;
  fundId: number;
  monthlyAmount: number | null;
  annualAmount: number;
}

export interface FakeCashLine {
  id: number;
  denominationId: number;
  congregationId: number;
  accountId: number;
  fundId: number;
  direction: 'IN' | 'OUT';
  amount: number;
  postedOn: string;
  description: string;
  reversalOfId: number | null;
}

/** In-memory stand-in for the database, with the tenant filters of the real repositories. */
export class InMemoryBudgets implements BudgetReader, BudgetWriter {
  congregations = new Map<number, { denominationId: number; name: string }>();
  accounts: (AccountData & { denominationId: number })[] = [];
  funds: (FundData & { denominationId: number })[] = [];
  budgets: StoredBudget[] = [];
  lines: StoredLine[] = [];
  cash: FakeCashLine[] = [];
  private nextId = 1000;

  findCongregationName(scope: TenantScope): Promise<string | null> {
    const found = this.congregations.get(scope.requireCongregationId());
    return Promise.resolve(
      found && found.denominationId === scope.denominationId
        ? found.name
        : null,
    );
  }

  findBudgets(scope: TenantScope, year: number): Promise<BudgetData[]> {
    return Promise.resolve(
      this.budgets
        .filter((budget) => this.owns(scope, budget) && budget.year === year)
        .map((budget) => this.data(budget)),
    );
  }

  findBudget(
    scope: TenantScope,
    year: number,
    type: BudgetTypeValue,
  ): Promise<BudgetData | null> {
    const found = this.budgets.find(
      (budget) =>
        this.owns(scope, budget) &&
        budget.year === year &&
        budget.type === type,
    );
    return Promise.resolve(found ? this.data(found) : null);
  }

  findBudgetById(scope: TenantScope, id: number): Promise<BudgetData | null> {
    const found = this.budgets.find(
      (budget) => this.owns(scope, budget) && budget.id === id,
    );
    return Promise.resolve(found ? this.data(found) : null);
  }

  findYears(scope: TenantScope): Promise<number[]> {
    return Promise.resolve([
      ...new Set(
        this.budgets.filter((b) => this.owns(scope, b)).map((b) => b.year),
      ),
    ]);
  }

  findLine(scope: TenantScope, id: number): Promise<LineWithBudget | null> {
    const line = this.lines.find((l) => l.id === id);
    const budget = line
      ? this.budgets.find((b) => b.id === line.budgetId)
      : undefined;
    if (!line || !budget || !this.owns(scope, budget)) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      line: this.lineData(line),
      budget: this.head(budget),
    });
  }

  findExecution(scope: TenantScope, year: number): Promise<ExecutionRow[]> {
    const counted = this.counted(scope, year);
    const grouped = new Map<string, ExecutionRow>();
    for (const move of counted) {
      const key = `${move.accountId}:${move.fundId}:${move.direction}`;
      const current = grouped.get(key);
      grouped.set(key, {
        accountId: move.accountId,
        fundId: move.fundId,
        direction: move.direction,
        amount: fromCents(toCents(current?.amount ?? 0) + toCents(move.amount)),
      });
    }
    return Promise.resolve([...grouped.values()]);
  }

  findMovements(
    scope: TenantScope,
    year: number,
    accountId: number,
    fundId: number,
  ): Promise<MovementData[]> {
    return Promise.resolve(
      this.counted(scope, year)
        .filter((m) => m.accountId === accountId && m.fundId === fundId)
        .map((m) => ({
          id: m.id,
          postedOn: m.postedOn,
          direction: m.direction,
          amount: m.amount,
          description: m.description,
        })),
    );
  }

  listPostableAccounts(denominationId: number): Promise<AccountData[]> {
    return Promise.resolve(
      this.accounts.filter(
        (a) => a.denominationId === denominationId && a.isPostable,
      ),
    );
  }

  listActiveFunds(denominationId: number): Promise<FundData[]> {
    return Promise.resolve(
      this.funds.filter(
        (f) => f.denominationId === denominationId && f.isActive,
      ),
    );
  }

  findAccount(denominationId: number, id: number): Promise<AccountData | null> {
    return Promise.resolve(
      this.accounts.find(
        (a) => a.denominationId === denominationId && a.id === id,
      ) ?? null,
    );
  }

  findFund(denominationId: number, id: number): Promise<FundData | null> {
    return Promise.resolve(
      this.funds.find(
        (f) => f.denominationId === denominationId && f.id === id,
      ) ?? null,
    );
  }

  createBudget(
    scope: TenantScope,
    year: number,
    type: BudgetTypeValue,
  ): Promise<BudgetHead> {
    const budget: StoredBudget = {
      id: this.nextId++,
      denominationId: scope.denominationId,
      congregationId: scope.requireCongregationId(),
      year,
      type,
      status: 'DRAFT',
      incomeIncreaseRate: null,
    };
    this.budgets.push(budget);
    return Promise.resolve(this.head(budget));
  }

  createLine(
    scope: TenantScope,
    budgetId: number,
    values: LineValues,
  ): Promise<BudgetLineData> {
    const line: StoredLine = {
      id: this.nextId++,
      denominationId: scope.denominationId,
      budgetId,
      ...values,
    };
    this.lines.push(line);
    return Promise.resolve(this.lineData(line));
  }

  updateLine(
    scope: TenantScope,
    lineId: number,
    values: LineValues,
  ): Promise<BudgetLineData | null> {
    const line = this.lines.find((l) => l.id === lineId);
    const budget = line && this.budgets.find((b) => b.id === line.budgetId);
    if (!line || !budget || !this.owns(scope, budget)) {
      return Promise.resolve(null);
    }
    Object.assign(line, values);
    return Promise.resolve(this.lineData(line));
  }

  deleteLine(scope: TenantScope, lineId: number): Promise<boolean> {
    const line = this.lines.find((l) => l.id === lineId);
    const budget = line && this.budgets.find((b) => b.id === line.budgetId);
    if (!line || !budget || !this.owns(scope, budget)) {
      return Promise.resolve(false);
    }
    this.lines = this.lines.filter((l) => l.id !== lineId);
    return Promise.resolve(true);
  }

  updateBudget(
    scope: TenantScope,
    budgetId: number,
    patch: { status?: BudgetStatusValue; incomeIncreaseRate?: number | null },
  ): Promise<BudgetHead | null> {
    const budget = this.budgets.find(
      (b) => b.id === budgetId && this.owns(scope, b),
    );
    if (!budget) {
      return Promise.resolve(null);
    }
    if (patch.status !== undefined) {
      budget.status = patch.status;
    }
    if (patch.incomeIncreaseRate !== undefined) {
      budget.incomeIncreaseRate = patch.incomeIncreaseRate;
    }
    return Promise.resolve(this.head(budget));
  }

  private owns(scope: TenantScope, budget: StoredBudget): boolean {
    return (
      budget.denominationId === scope.denominationId &&
      budget.congregationId === scope.congregationId
    );
  }

  private counted(scope: TenantScope, year: number): FakeCashLine[] {
    const reversed = new Set(
      this.cash
        .filter((m) => m.reversalOfId !== null)
        .map((m) => m.reversalOfId),
    );
    return this.cash.filter(
      (m) =>
        m.denominationId === scope.denominationId &&
        m.congregationId === scope.congregationId &&
        m.postedOn.startsWith(`${year}-`) &&
        m.reversalOfId === null &&
        !reversed.has(m.id),
    );
  }

  private head(budget: StoredBudget): BudgetHead {
    return {
      id: budget.id,
      year: budget.year,
      type: budget.type,
      status: budget.status,
      incomeIncreaseRate: budget.incomeIncreaseRate,
    };
  }

  private data(budget: StoredBudget): BudgetData {
    return {
      ...this.head(budget),
      lines: this.lines
        .filter((l) => l.budgetId === budget.id)
        .map((l) => this.lineData(l)),
    };
  }

  private lineData(line: StoredLine): BudgetLineData {
    const account = this.accounts.find((a) => a.id === line.accountId);
    const fund = this.funds.find((f) => f.id === line.fundId);
    return {
      id: line.id,
      budgetId: line.budgetId,
      accountId: line.accountId,
      accountCode: account?.code ?? '?',
      accountName: account?.name ?? '?',
      nature: account?.nature ?? 'EXPENSE',
      fundId: line.fundId,
      fundName: fund?.name ?? '?',
      monthlyAmount: line.monthlyAmount,
      annualAmount: line.annualAmount,
    };
  }
}
