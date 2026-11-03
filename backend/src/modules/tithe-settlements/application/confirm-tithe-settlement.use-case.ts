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
} from '../../../common/errors/domain.exception.js';
import {
  DocumentNumberingService,
  formatVoucherCode,
} from '../../../common/numbering/document-numbering.service.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { TitheDraftService } from './tithe-draft.service.js';
import type { TitheDraft } from './tithe-draft.service.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import { TITHE_SETTLEMENT_LEDGER } from './tithe-settlement.config.js';
import { toSettlementRow } from './tithe-settlement.mappers.js';
import type {
  NewCashLine,
  TitheRangeView,
  TitheSettlementRow,
} from './tithe-settlement.models.js';
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
  'nationalShare',
  'localFundShare',
  'pastorNet',
  'contributions',
] as const;

@Injectable()
export class ConfirmTitheSettlementUseCase {
  constructor(
    private readonly drafts: TitheDraftService,
    private readonly numbering: DocumentNumberingService,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(TITHE_SETTLEMENT_READER)
    private readonly reader: TitheSettlementReader,
    @Inject(TITHE_SETTLEMENT_WRITER)
    private readonly writer: TitheSettlementWriter,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  /**
   * The server recomputes the draft inside the transaction. Reserving the voucher number first takes
   * the row lock of the sequence, so two confirmations of the same sede queue up and the overlap
   * check of the second one sees the first.
   */
  async execute(
    tenant: TenantContext,
    range: TitheRangeView,
    ipAddress: string | null,
  ): Promise<TitheSettlementRow> {
    const scope = requireCongregationScope(tenant, 'liquidar el diezmo');
    return await this.transactions.run(async (transaction) => {
      const voucherType = TITHE_SETTLEMENT_LEDGER.voucherType;
      const voucherNumber = await this.numbering.nextVoucherNumber(
        scope,
        voucherType,
        transaction,
      );
      const draft = await this.drafts.build(scope, range, transaction);
      if (draft.settleable.length === 0) {
        throw new BusinessRuleException(
          'No hay diezmos por liquidar en el rango seleccionado.',
          'NO_TITHES',
        );
      }

      const { year, month } = yearMonthOf(draft.today);
      const period = await this.reader.findPeriod(
        scope,
        year,
        month,
        transaction,
      );
      if (!period) {
        throw new BusinessRuleException(
          `No existe el periodo contable de ${monthLabel({ year, month })}. Créalo en la configuración contable antes de liquidar.`,
          'PERIOD_NOT_FOUND',
        );
      }
      if (period.status !== 'OPEN') {
        throw new ConflictDomainException(
          `El periodo contable de ${monthLabel({ year, month })} está cerrado.`,
          'PERIOD_CLOSED',
        );
      }

      const code = formatVoucherCode(voucherType, draft.today, voucherNumber);
      const record = await this.writer.create(
        scope,
        {
          userId: tenant.userId,
          voucherType,
          voucherNumber,
          settledOn: draft.today,
          periodId: period.id,
          coveredFrom: range.from,
          coveredTo: range.to,
          grossTithe: draft.grossTithe,
          nationalShareRate: draft.rule.nationalShareRate,
          localFundRate: draft.rule.localFundRate,
          ...draft.allocation,
          contributionIds: draft.settleable.map((tithe) => tithe.id),
          cashLines: this.cashLines(draft, code),
        },
        transaction,
      );

      await this.audit.record(
        {
          action: 'TITHE_SETTLED',
          entity: 'TitheSettlement',
          entityId: record.id,
          actor: tenant,
          ipAddress,
          changes: buildAuditChanges(
            null,
            {
              status: 'ISSUED',
              number: code,
              grossTithe: record.grossTithe,
              nationalShare: record.nationalShare,
              localFundShare: record.localFundShare,
              pastorNet: record.pastorNet,
              contributions: draft.settleable.length,
            },
            AUDIT_FIELDS,
          ),
        },
        transaction,
      );
      return toSettlementRow(record);
    });
  }

  /**
   * Cash lines for what the sede pays. Everything is validated before the first write; a component
   * without an account in the chart generates no movement, an inactive fund refuses the settlement.
   */
  private cashLines(draft: TitheDraft, code: string): NewCashLine[] {
    const lines: NewCashLine[] = [];
    const candidates = [
      {
        target: draft.bookings.nationalShare,
        amount: draft.allocation.nationalShare,
        description: TITHE_SETTLEMENT_LEDGER.descriptions.nationalShare,
      },
      {
        target: draft.bookings.pastorNet,
        amount: draft.allocation.pastorNet,
        description: TITHE_SETTLEMENT_LEDGER.descriptions.pastorNet,
      },
    ];
    for (const { target, amount, description } of candidates) {
      if (!target || amount <= 0) {
        continue;
      }
      if (!target.fundIsActive) {
        throw new BusinessRuleException(
          `El fondo «${target.fundName}» de la cuenta ${target.accountCode} está inactivo: actívalo en la configuración contable antes de liquidar.`,
          'FUND_INACTIVE',
        );
      }
      lines.push({
        accountId: target.accountId,
        fundId: target.fundId,
        amount,
        description: `${description} · ${code}`,
      });
    }
    return lines;
  }
}
