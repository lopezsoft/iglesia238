import { Inject, Injectable } from '@nestjs/common';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import { AUDIT_RECORDER } from '../../../common/audit/audit-recorder.port.js';
import type { AuditRecorder } from '../../../common/audit/audit-recorder.port.js';
import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import { budgetClosedError } from './save-budget-line.use-case.js';
import { BUDGET_READER, BUDGET_WRITER } from './budget.ports.js';
import type { BudgetReader, BudgetWriter } from './budget.ports.js';

/** A line is the only budget record that is really deleted: the cash book keeps its movements and the audit keeps the trace. */
@Injectable()
export class DeleteBudgetLineUseCase {
  constructor(
    @Inject(BUDGET_READER) private readonly reader: BudgetReader,
    @Inject(BUDGET_WRITER) private readonly writer: BudgetWriter,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    tenant: TenantContext,
    lineId: number,
    ipAddress: string | null,
  ): Promise<void> {
    const scope = requireCongregationScope(
      tenant,
      'administrar el presupuesto',
    );
    await this.transactions.run(async (transaction) => {
      const found = await this.reader.findLine(scope, lineId, transaction);
      if (!found) {
        throw new NotFoundDomainException(
          'La línea no existe en el presupuesto de la sede.',
        );
      }
      if (found.budget.status === 'CLOSED') {
        throw budgetClosedError(found.budget.year);
      }
      if (!(await this.writer.deleteLine(scope, lineId, transaction))) {
        throw new NotFoundDomainException(
          'La línea no existe en el presupuesto de la sede.',
        );
      }
      await this.audit.record(
        {
          action: 'BUDGET_LINE_DELETED',
          entity: 'BudgetLine',
          entityId: lineId,
          actor: tenant,
          ipAddress,
          changes: buildAuditChanges(
            {
              budget: `${found.budget.type} ${found.budget.year}`,
              annualAmount: found.line.annualAmount,
            },
            { budget: null, annualAmount: null },
            ['budget', 'annualAmount'],
          ),
        },
        transaction,
      );
    });
  }
}
