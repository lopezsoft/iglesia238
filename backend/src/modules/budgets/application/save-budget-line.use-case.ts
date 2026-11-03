import { Inject, Injectable } from '@nestjs/common';
import { MAX_MONEY_AMOUNT } from '../../../common/accounting/accounting-rules.js';
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
  type Transaction,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import { buildView } from './budget-view.js';
import { assertBudgetYear } from './get-budget-overview.use-case.js';
import type {
  BudgetHead,
  BudgetLineRow,
  SaveBudgetLineCommand,
} from './budget.models.js';
import { BUDGET_READER, BUDGET_WRITER } from './budget.ports.js';
import type { BudgetReader, BudgetWriter } from './budget.ports.js';

const AUDIT_FIELDS = [
  'budget',
  'account',
  'fund',
  'annualAmount',
  'monthlyAmount',
] as const;

export function budgetClosedError(year: number): ConflictDomainException {
  return new ConflictDomainException(
    `El presupuesto ${year} está cerrado: solo lectura.`,
    'BUDGET_CLOSED',
  );
}

function assertAmounts(command: SaveBudgetLineCommand): void {
  const { annualAmount, monthlyAmount } = command;
  if (
    !Number.isFinite(annualAmount) ||
    annualAmount <= 0 ||
    annualAmount > MAX_MONEY_AMOUNT
  ) {
    throw new InvalidInputException(
      'El valor anual debe ser mayor que cero.',
      'INVALID_AMOUNT',
    );
  }
  if (
    monthlyAmount !== null &&
    (!Number.isFinite(monthlyAmount) ||
      monthlyAmount <= 0 ||
      monthlyAmount > annualAmount)
  ) {
    throw new InvalidInputException(
      'El valor mensual debe ser mayor que cero y no superar el anual.',
      'INVALID_MONTHLY_AMOUNT',
    );
  }
}

@Injectable()
export class SaveBudgetLineUseCase {
  constructor(
    @Inject(BUDGET_READER) private readonly reader: BudgetReader,
    @Inject(BUDGET_WRITER) private readonly writer: BudgetWriter,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  /** `lineId` null adds a line; otherwise it edits that line of the sede. */
  async execute(
    tenant: TenantContext,
    lineId: number | null,
    command: SaveBudgetLineCommand,
    ipAddress: string | null,
  ): Promise<BudgetLineRow> {
    const scope = requireCongregationScope(
      tenant,
      'administrar el presupuesto',
    );
    assertBudgetYear(command.year);
    assertAmounts(command);

    return await this.transactions.run(async (transaction) => {
      const existing =
        lineId === null
          ? null
          : await this.reader.findLine(scope, lineId, transaction);
      if (lineId !== null && !existing) {
        throw new NotFoundDomainException(
          'La línea no existe en el presupuesto de la sede.',
        );
      }
      if (
        existing &&
        (existing.budget.year !== command.year ||
          existing.budget.type !== command.type)
      ) {
        throw new NotFoundDomainException(
          'La línea no pertenece a ese presupuesto.',
        );
      }

      const account = await this.reader.findAccount(
        scope.denominationId,
        command.accountId,
        transaction,
      );
      if (!account || !account.isPostable || !account.isActive) {
        throw new BusinessRuleException(
          'Selecciona una cuenta imputable activa.',
          'ACCOUNT_NOT_POSTABLE',
        );
      }
      const fund = await this.reader.findFund(
        scope.denominationId,
        command.fundId,
        transaction,
      );
      if (!fund || !fund.isActive) {
        throw new BusinessRuleException(
          'El fondo o comité no existe o está inactivo.',
          'FUND_INACTIVE',
        );
      }

      const budget =
        (await this.reader.findBudget(
          scope,
          command.year,
          command.type,
          transaction,
        )) ?? null;
      if (budget?.status === 'CLOSED') {
        throw budgetClosedError(command.year);
      }
      if (
        budget?.lines.some(
          (line) =>
            line.accountId === account.id &&
            line.fundId === fund.id &&
            line.id !== lineId,
        )
      ) {
        throw new ConflictDomainException(
          `Ya existe una línea para ${account.code} · ${fund.name} en el presupuesto ${command.year}. Ajusta la línea existente en lugar de duplicarla.`,
          'DUPLICATE_BUDGET_LINE',
        );
      }

      const head: BudgetHead =
        budget ??
        (await this.writer.createBudget(
          scope,
          command.year,
          command.type,
          transaction,
        ));
      const values = {
        accountId: account.id,
        fundId: fund.id,
        annualAmount: command.annualAmount,
        monthlyAmount: command.monthlyAmount,
      };
      const saved = existing
        ? await this.writer.updateLine(
            scope,
            existing.line.id,
            values,
            transaction,
          )
        : await this.writer.createLine(scope, head.id, values, transaction);
      if (!saved) {
        throw new NotFoundDomainException(
          'La línea no existe en el presupuesto de la sede.',
        );
      }

      await this.audit.record(
        {
          action: existing ? 'BUDGET_LINE_UPDATED' : 'BUDGET_LINE_CREATED',
          entity: 'BudgetLine',
          entityId: saved.id,
          actor: tenant,
          ipAddress,
          changes: buildAuditChanges(
            existing
              ? {
                  budget: `${head.type} ${head.year}`,
                  account: existing.line.accountCode,
                  fund: existing.line.fundName,
                  annualAmount: existing.line.annualAmount,
                  monthlyAmount: existing.line.monthlyAmount,
                }
              : null,
            {
              budget: `${head.type} ${head.year}`,
              account: account.code,
              fund: fund.name,
              annualAmount: saved.annualAmount,
              monthlyAmount: saved.monthlyAmount,
            },
            AUDIT_FIELDS,
          ),
        },
        transaction,
      );

      return await this.rowOf(scope, command, saved.id, transaction);
    });
  }

  private async rowOf(
    scope: TenantScope,
    command: SaveBudgetLineCommand,
    lineId: number,
    transaction: Transaction,
  ): Promise<BudgetLineRow> {
    const [budget, execution] = await Promise.all([
      this.reader.findBudget(scope, command.year, command.type, transaction),
      this.reader.findExecution(scope, command.year),
    ]);
    const row = buildView(command.type, budget, execution).lines.find(
      (line) => line.id === lineId,
    );
    if (!row) {
      throw new NotFoundDomainException(
        'La línea no existe en el presupuesto de la sede.',
      );
    }
    return row;
  }
}
