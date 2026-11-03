import { Inject, Injectable } from '@nestjs/common';
import { InvalidInputException } from '../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { compareSpanish } from '../../../common/text/comparable-text.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { expectedExecutionPct } from './budget-execution.js';
import { buildView, emptyView } from './budget-view.js';
import type { BudgetOverview } from './budget.models.js';
import { BUDGET_READER } from './budget.ports.js';
import type { BudgetReader } from './budget.ports.js';

export const MIN_BUDGET_YEAR = 2000;
export const MAX_BUDGET_YEAR = 2100;

const ALL_CONGREGATIONS = 'todas las sedes';

export function assertBudgetYear(year: number): void {
  if (
    !Number.isInteger(year) ||
    year < MIN_BUDGET_YEAR ||
    year > MAX_BUDGET_YEAR
  ) {
    throw new InvalidInputException(
      'El año del presupuesto no es válido.',
      'INVALID_YEAR',
    );
  }
}

@Injectable()
export class GetBudgetOverviewUseCase {
  constructor(
    @Inject(BUDGET_READER) private readonly reader: BudgetReader,
    private readonly clock: Clock,
  ) {}

  /** `requestedYear` null means the current year. */
  async execute(
    tenant: TenantContext,
    requestedYear: number | null,
  ): Promise<BudgetOverview> {
    const scope = tenant.tenantScope();
    const today = this.clock.today();
    const currentYear = Number(today.slice(0, 4));
    const year = requestedYear ?? currentYear;
    assertBudgetYear(year);

    const [accounts, funds] = await Promise.all([
      this.reader.listPostableAccounts(scope.denominationId),
      this.reader.listActiveFunds(scope.denominationId),
    ]);
    const options = {
      accounts: accounts
        .filter((account) => account.isActive)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((account) => ({
          id: account.id,
          label: `${account.code} · ${account.name}`,
          nature: account.nature,
        })),
      funds: funds
        .sort((a, b) => compareSpanish(a.name, b.name))
        .map((fund) => ({ id: fund.id, label: fund.name })),
    };

    if (scope.congregationId === null) {
      return {
        today,
        year,
        years: [...new Set([currentYear + 1, currentYear, year])].sort(
          (a, b) => b - a,
        ),
        congregationScoped: false,
        congregationName: ALL_CONGREGATIONS,
        expectedPct: expectedExecutionPct(year, today),
        fixed: emptyView('FIXED'),
        committee: emptyView('COMMITTEE'),
        ...options,
      };
    }

    const [name, budgets, execution, budgetYears] = await Promise.all([
      this.reader.findCongregationName(scope),
      this.reader.findBudgets(scope, year),
      this.reader.findExecution(scope, year),
      this.reader.findYears(scope),
    ]);
    const ofType = (type: 'FIXED' | 'COMMITTEE') =>
      budgets.find((budget) => budget.type === type) ?? null;

    return {
      today,
      year,
      years: [
        ...new Set([...budgetYears, currentYear, currentYear + 1, year]),
      ].sort((a, b) => b - a),
      congregationScoped: true,
      congregationName: name ?? '',
      expectedPct: expectedExecutionPct(year, today),
      fixed: buildView('FIXED', ofType('FIXED'), execution),
      committee: buildView('COMMITTEE', ofType('COMMITTEE'), execution),
      ...options,
    };
  }
}
