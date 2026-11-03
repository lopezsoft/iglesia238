import { Inject, Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  executedFromMovements,
  monthlyBreakdown,
  toLineRow,
} from './budget-execution.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import type { BudgetLineDetail } from './budget.models.js';
import { BUDGET_READER } from './budget.ports.js';
import type { BudgetReader } from './budget.ports.js';

const MOVEMENT_LIMIT = 25;

/** One line with its month-by-month execution and its latest cash movements (drill-down). */
@Injectable()
export class GetBudgetLineDetailUseCase {
  constructor(@Inject(BUDGET_READER) private readonly reader: BudgetReader) {}

  async execute(
    tenant: TenantContext,
    lineId: number,
  ): Promise<BudgetLineDetail> {
    const scope = requireCongregationScope(tenant, 'consultar el presupuesto');
    const found = await this.reader.findLine(scope, lineId);
    if (!found) {
      throw new NotFoundDomainException(
        'La línea no existe en el presupuesto de la sede.',
      );
    }
    const { line, budget } = found;
    const [movements, siblings] = await Promise.all([
      this.reader.findMovements(
        scope,
        budget.year,
        line.accountId,
        line.fundId,
      ),
      budget.type === 'COMMITTEE'
        ? this.reader.findBudgetById(scope, budget.id)
        : Promise.resolve(null),
    ]);
    const sharedWith =
      siblings?.lines
        .filter(
          (other) =>
            other.accountId === line.accountId && other.fundId !== line.fundId,
        )
        .map((other) => other.fundName) ?? [];

    return {
      line: toLineRow(
        line,
        executedFromMovements(movements, line.nature),
        sharedWith,
      ),
      year: budget.year,
      type: budget.type,
      status: budget.status,
      months: monthlyBreakdown(line, movements),
      movements: [...movements]
        .sort((a, b) => b.postedOn.localeCompare(a.postedOn) || b.id - a.id)
        .slice(0, MOVEMENT_LIMIT),
    };
  }
}
