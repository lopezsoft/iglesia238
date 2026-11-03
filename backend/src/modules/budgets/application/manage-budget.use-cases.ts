import { Inject, Injectable } from '@nestjs/common';
import { roundMoney } from '../../../common/accounting/accounting-rules.js';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import { AUDIT_RECORDER } from '../../../common/audit/audit-recorder.port.js';
import type { AuditRecorder } from '../../../common/audit/audit-recorder.port.js';
import {
  BusinessRuleException,
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import { assertBudgetYear } from './get-budget-overview.use-case.js';
import { budgetClosedError } from './save-budget-line.use-case.js';
import type {
  BudgetHead,
  BudgetStatusValue,
  CopyBudgetCommand,
  CopyBudgetResult,
} from './budget.models.js';
import { BUDGET_READER, BUDGET_WRITER } from './budget.ports.js';
import type { BudgetReader, BudgetWriter } from './budget.ports.js';

const ALLOWED_TRANSITIONS: Readonly<
  Record<BudgetStatusValue, readonly BudgetStatusValue[]>
> = {
  DRAFT: ['APPROVED'],
  APPROVED: ['DRAFT', 'CLOSED'],
  CLOSED: [],
};

const STATUS_ACTIONS: Readonly<Record<BudgetStatusValue, string>> = {
  DRAFT: 'BUDGET_REOPENED',
  APPROVED: 'BUDGET_APPROVED',
  CLOSED: 'BUDGET_CLOSED',
};

/** Draft -> approved -> closed. An approved budget can go back to draft; a closed one is final. */
@Injectable()
export class ChangeBudgetStatusUseCase {
  constructor(
    @Inject(BUDGET_READER) private readonly reader: BudgetReader,
    @Inject(BUDGET_WRITER) private readonly writer: BudgetWriter,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    tenant: TenantContext,
    budgetId: number,
    status: BudgetStatusValue,
    ipAddress: string | null,
  ): Promise<BudgetHead> {
    const scope = requireCongregationScope(
      tenant,
      'administrar el presupuesto',
    );
    return await this.transactions.run(async (transaction) => {
      const budget = await this.reader.findBudgetById(
        scope,
        budgetId,
        transaction,
      );
      if (!budget) {
        throw new NotFoundDomainException(
          'El presupuesto no existe en la sede.',
        );
      }
      if (budget.status === 'CLOSED') {
        throw budgetClosedError(budget.year);
      }
      if (!ALLOWED_TRANSITIONS[budget.status].includes(status)) {
        throw new ConflictDomainException(
          'Ese cambio de estado no está permitido para el presupuesto.',
          'BUDGET_STATUS_INVALID',
        );
      }
      if (status === 'APPROVED' && budget.lines.length === 0) {
        throw new BusinessRuleException(
          'Agrega al menos una línea antes de aprobar el presupuesto.',
          'BUDGET_EMPTY',
        );
      }

      const updated = await this.writer.updateBudget(
        scope,
        budgetId,
        { status },
        transaction,
      );
      if (!updated) {
        throw new NotFoundDomainException(
          'El presupuesto no existe en la sede.',
        );
      }
      await this.audit.record(
        {
          action: STATUS_ACTIONS[status],
          entity: 'Budget',
          entityId: budgetId,
          actor: tenant,
          ipAddress,
          changes: buildAuditChanges(
            { status: budget.status },
            { status: updated.status },
            ['status'],
          ),
        },
        transaction,
      );
      return updated;
    });
  }
}

/** Expected growth of the income of the year (a fraction), used to compare the budget with the previous year. */
@Injectable()
export class UpdateBudgetIncomeRateUseCase {
  constructor(
    @Inject(BUDGET_READER) private readonly reader: BudgetReader,
    @Inject(BUDGET_WRITER) private readonly writer: BudgetWriter,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    tenant: TenantContext,
    budgetId: number,
    rate: number | null,
    ipAddress: string | null,
  ): Promise<BudgetHead> {
    const scope = requireCongregationScope(
      tenant,
      'administrar el presupuesto',
    );
    if (
      rate !== null &&
      (!Number.isFinite(rate) ||
        rate < 0 ||
        rate > 1 ||
        Math.abs(rate * 10_000 - Math.round(rate * 10_000)) > 1e-6)
    ) {
      throw new InvalidInputException(
        'El incremento de ingresos debe estar entre 0 % y 100 %, con hasta dos decimales.',
        'INVALID_RATE',
      );
    }
    return await this.transactions.run(async (transaction) => {
      const budget = await this.reader.findBudgetById(
        scope,
        budgetId,
        transaction,
      );
      if (!budget) {
        throw new NotFoundDomainException(
          'El presupuesto no existe en la sede.',
        );
      }
      if (budget.status === 'CLOSED') {
        throw budgetClosedError(budget.year);
      }
      const updated = await this.writer.updateBudget(
        scope,
        budgetId,
        { incomeIncreaseRate: rate },
        transaction,
      );
      if (!updated) {
        throw new NotFoundDomainException(
          'El presupuesto no existe en la sede.',
        );
      }
      await this.audit.record(
        {
          action: 'BUDGET_UPDATED',
          entity: 'Budget',
          entityId: budgetId,
          actor: tenant,
          ipAddress,
          changes: buildAuditChanges(
            { incomeIncreaseRate: budget.incomeIncreaseRate },
            { incomeIncreaseRate: updated.incomeIncreaseRate },
            ['incomeIncreaseRate'],
          ),
        },
        transaction,
      );
      return updated;
    });
  }
}

/** Starts the budget of a year from another one, optionally adjusting every amount by a percentage. */
@Injectable()
export class CopyBudgetUseCase {
  constructor(
    @Inject(BUDGET_READER) private readonly reader: BudgetReader,
    @Inject(BUDGET_WRITER) private readonly writer: BudgetWriter,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    tenant: TenantContext,
    command: CopyBudgetCommand,
    ipAddress: string | null,
  ): Promise<CopyBudgetResult> {
    const scope = requireCongregationScope(
      tenant,
      'administrar el presupuesto',
    );
    assertBudgetYear(command.sourceYear);
    assertBudgetYear(command.targetYear);
    if (command.sourceYear === command.targetYear) {
      throw new InvalidInputException(
        'El año de destino debe ser distinto al de origen.',
        'INVALID_YEAR',
      );
    }
    const rate = command.adjustmentRate;
    if (
      rate !== null &&
      (!Number.isFinite(rate) || rate < -0.99 || rate > 10)
    ) {
      throw new InvalidInputException(
        'El ajuste porcentual no es válido.',
        'INVALID_RATE',
      );
    }

    return await this.transactions.run(async (transaction) => {
      const source = await this.reader.findBudget(
        scope,
        command.sourceYear,
        command.type,
        transaction,
      );
      if (!source || source.lines.length === 0) {
        throw new NotFoundDomainException(
          `No hay un presupuesto con líneas en ${command.sourceYear} para copiar.`,
          'SOURCE_BUDGET_NOT_FOUND',
        );
      }
      const target = await this.reader.findBudget(
        scope,
        command.targetYear,
        command.type,
        transaction,
      );
      if (target?.status === 'CLOSED') {
        throw budgetClosedError(command.targetYear);
      }
      const head =
        target ??
        (await this.writer.createBudget(
          scope,
          command.targetYear,
          command.type,
          transaction,
        ));

      const [accounts, funds] = await Promise.all([
        this.reader.listPostableAccounts(scope.denominationId),
        this.reader.listActiveFunds(scope.denominationId),
      ]);
      const usable = (accountId: number, fundId: number) =>
        accounts.some(
          (account) => account.id === accountId && account.isActive,
        ) && funds.some((fund) => fund.id === fundId && fund.isActive);

      let copied = 0;
      let skipped = 0;
      for (const line of source.lines) {
        const exists = target?.lines.some(
          (other) =>
            other.accountId === line.accountId && other.fundId === line.fundId,
        );
        if (exists || !usable(line.accountId, line.fundId)) {
          skipped += 1;
          continue;
        }
        const adjust = (amount: number) =>
          rate === null ? amount : roundMoney(amount * (1 + rate));
        const annualAmount = adjust(line.annualAmount);
        if (annualAmount <= 0) {
          skipped += 1;
          continue;
        }
        await this.writer.createLine(
          scope,
          head.id,
          {
            accountId: line.accountId,
            fundId: line.fundId,
            annualAmount,
            monthlyAmount:
              line.monthlyAmount === null
                ? null
                : Math.min(adjust(line.monthlyAmount), annualAmount),
          },
          transaction,
        );
        copied += 1;
      }

      await this.audit.record(
        {
          action: 'BUDGET_COPIED',
          entity: 'Budget',
          entityId: head.id,
          actor: tenant,
          ipAddress,
          changes: buildAuditChanges(
            null,
            {
              budget: `${command.type} ${command.targetYear}`,
              source: `${command.type} ${command.sourceYear}`,
              copied,
              skipped,
              adjustmentRate: rate,
            },
            ['budget', 'source', 'copied', 'skipped', 'adjustmentRate'],
          ),
        },
        transaction,
      );
      return { budgetId: head.id, copied, skipped };
    });
  }
}
