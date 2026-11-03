import { Inject, Injectable } from '@nestjs/common';
import {
  monthLabel,
  yearMonthOf,
} from '../../../common/accounting/accounting-rules.js';
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
import { collapseSpaces } from '../../../common/text/comparable-text.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { settlementNumber } from './tithe-range.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import {
  MAX_VOID_REASON_LENGTH,
  MIN_VOID_REASON_LENGTH,
} from './tithe-settlement.config.js';
import { toSettlementRow } from './tithe-settlement.mappers.js';
import type { TitheSettlementRow } from './tithe-settlement.models.js';
import {
  TITHE_SETTLEMENT_READER,
  TITHE_SETTLEMENT_WRITER,
} from './tithe-settlement.ports.js';
import type {
  TitheSettlementReader,
  TitheSettlementWriter,
} from './tithe-settlement.ports.js';

const AUDIT_FIELDS = [
  'status',
  'number',
  'grossTithe',
  'releasedContributions',
] as const;

@Injectable()
export class VoidTitheSettlementUseCase {
  constructor(
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(TITHE_SETTLEMENT_READER)
    private readonly reader: TitheSettlementReader,
    @Inject(TITHE_SETTLEMENT_WRITER)
    private readonly writer: TitheSettlementWriter,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
    rawReason: string,
    ipAddress: string | null,
  ): Promise<TitheSettlementRow> {
    const scope = requireCongregationScope(
      tenant,
      'anular liquidaciones del diezmo',
    );
    const reason = collapseSpaces(rawReason ?? '');
    if (
      reason.length < MIN_VOID_REASON_LENGTH ||
      reason.length > MAX_VOID_REASON_LENGTH
    ) {
      throw new InvalidInputException(
        `Describe el motivo de la anulación (de ${MIN_VOID_REASON_LENGTH} a ${MAX_VOID_REASON_LENGTH} caracteres).`,
        'VOID_REASON_REQUIRED',
      );
    }

    return await this.transactions.run(async (transaction) => {
      const current = await this.reader.findById(scope, id, transaction);
      if (!current) {
        throw new NotFoundDomainException(
          'La liquidación no existe en la sede.',
        );
      }
      if (current.status === 'VOIDED') {
        throw new ConflictDomainException(
          'La liquidación ya está anulada.',
          'ALREADY_VOIDED',
        );
      }

      const today = this.clock.today();
      const { year, month } = yearMonthOf(today);
      const period = await this.reader.findPeriod(
        scope,
        year,
        month,
        transaction,
      );
      if (!period) {
        throw new BusinessRuleException(
          `No existe el periodo contable de ${monthLabel({ year, month })}: las reversas de caja se registran en el periodo vigente.`,
          'PERIOD_NOT_FOUND',
        );
      }
      if (period.status !== 'OPEN') {
        throw new ConflictDomainException(
          `El periodo contable de ${monthLabel({ year, month })} está cerrado.`,
          'PERIOD_CLOSED',
        );
      }

      const number = settlementNumber(current);
      const outcome = await this.writer.void(
        scope,
        id,
        {
          userId: tenant.userId,
          reason,
          today,
          periodId: period.id,
          reversalDescription: `Reversa por anulación de la liquidación ${number}`,
        },
        transaction,
      );
      if (!outcome) {
        // Someone voided it between the read and the write.
        throw new ConflictDomainException(
          'La liquidación ya está anulada.',
          'ALREADY_VOIDED',
        );
      }

      await this.audit.record(
        {
          action: 'TITHE_SETTLEMENT_VOIDED',
          entity: 'TitheSettlement',
          entityId: id,
          actor: tenant,
          ipAddress,
          changes: buildAuditChanges(
            { status: 'ISSUED', releasedContributions: null },
            {
              status: 'VOIDED',
              number,
              grossTithe: current.grossTithe,
              releasedContributions: outcome.releasedCount,
            },
            AUDIT_FIELDS,
          ),
        },
        transaction,
      );
      return toSettlementRow(outcome.record);
    });
  }
}
