import { Inject, Injectable } from '@nestjs/common';
import {
  MAX_MONEY_AMOUNT,
  fromCents,
  toCents,
  yearMonthOf,
  type YearMonth,
} from '../../../common/accounting/accounting-rules.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import type { PeriodRecord } from '../../../common/accounting/period-view.js';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  BusinessRuleException,
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import { DocumentNumberingService } from '../../../common/numbering/document-numbering.service.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  CASH_BOOK_REPOSITORY,
  type CashBookRepository,
  type Direction,
} from './cash-book.repository.js';
import {
  isConsolidation,
  reversalBlockOf,
  voucherCodeOf,
  type ReversalBlock,
} from './cash-book-rules.js';
import type { CashMovementReceiptView } from './cash-book.views.js';
import { formatVoucherCode } from '../../../common/numbering/document-numbering.service.js';

export interface RecordMovementInput {
  readonly fundId: number;
  readonly direction: Direction;
  readonly accountId: number;
  readonly postedOn: string;
  readonly amount: number;
  readonly description: string;
}

export interface ReverseMovementInput {
  readonly transactionId: number;
  readonly postedOn: string;
  readonly reason: string;
}

const MIN_DESCRIPTION = 3;
const MAX_DESCRIPTION = 255;
const MIN_REASON = 10;
const MAX_REASON = 200;

const BLOCK_ERRORS: Record<ReversalBlock, () => Error> = {
  IS_REVERSAL: alreadyReversed,
  ALREADY_REVERSED: alreadyReversed,
  CONTRIBUTION: () =>
    new ConflictDomainException(
      'Este movimiento corresponde a un aporte: anúlalo desde Aportes.',
      'CONTRIBUTION_LINE',
    ),
  TITHE_SETTLEMENT: () =>
    new ConflictDomainException(
      'Este movimiento corresponde a una liquidación del diezmo: anula la liquidación.',
      'SETTLEMENT_LINE',
    ),
  CONSOLIDATION_PERIOD_CLOSED: () =>
    new ConflictDomainException(
      'La consolidación agrupa aportes de un periodo cerrado: reversarla los dejaría sin poder consolidarse de nuevo. Registra el ajuste con un movimiento nuevo en el periodo abierto.',
      'CONSOLIDATION_PERIOD_CLOSED',
    ),
};

function alreadyReversed(): Error {
  return new ConflictDomainException(
    'El movimiento ya fue reversado o es una reversa: no admite otra reversa.',
    'ALREADY_REVERSED',
  );
}

/**
 * Posting and reversing cash lines. A line is never edited nor deleted: it is corrected with a reversal
 * (same account, fund and amount, opposite direction). Every line carries a CI or CE voucher whose number
 * comes from the congregation's counter, inside the same transaction as the line.
 */
@Injectable()
export class CashMovementsService {
  constructor(
    @Inject(CASH_BOOK_REPOSITORY) private readonly book: CashBookRepository,
    private readonly numbering: DocumentNumberingService,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async record(
    tenant: TenantContext,
    input: RecordMovementInput,
  ): Promise<CashMovementReceiptView> {
    const scope = requireCongregationScope(
      tenant,
      'registrar movimientos de caja',
    );
    if (input.direction !== 'IN' && input.direction !== 'OUT') {
      throw new InvalidInputException(
        'Indica si el movimiento es una entrada o una salida.',
        'INVALID_DIRECTION',
      );
    }
    const description = input.description.trim();
    if (
      description.length < MIN_DESCRIPTION ||
      description.length > MAX_DESCRIPTION
    ) {
      throw new InvalidInputException(
        'Describe el movimiento (de 3 a 255 caracteres).',
        'DESCRIPTION_REQUIRED',
      );
    }
    const amount = this.validAmount(input.amount);

    const account = await this.book.findAccount(scope, input.accountId);
    if (!account || !account.isPostable || !account.isActive) {
      throw new BusinessRuleException(
        'La cuenta no es imputable: elige una cuenta que reciba movimientos.',
        'ACCOUNT_NOT_POSTABLE',
      );
    }
    const expected = input.direction === 'IN' ? 'INCOME' : 'EXPENSE';
    if (account.nature !== expected) {
      throw new BusinessRuleException(
        input.direction === 'IN'
          ? 'Una entrada se registra en una cuenta de ingreso.'
          : 'Una salida se registra en una cuenta de egreso.',
        'ACCOUNT_NATURE_MISMATCH',
      );
    }
    const fund = await this.book.findFund(scope, input.fundId);
    if (!fund || !fund.isActive) {
      throw new ConflictDomainException(
        'El fondo no existe o está inactivo.',
        'FUND_INACTIVE',
      );
    }
    this.requireNotFuture(input.postedOn, 'La fecha del movimiento');
    const period = await this.openPeriodFor(scope, input.postedOn);

    const voucherType = input.direction === 'IN' ? 'CI' : 'CE';
    return this.transactions.run(async (transaction) => {
      const voucherNumber = await this.numbering.nextVoucherNumber(
        scope,
        voucherType,
        transaction,
      );
      const voucher = await this.book.createVoucher(
        scope,
        { type: voucherType, number: voucherNumber, issuedOn: input.postedOn },
        transaction,
      );
      const line = await this.book.createTransaction(
        scope,
        {
          periodId: period.id,
          accountId: account.id,
          fundId: fund.id,
          voucherId: voucher.id,
          direction: input.direction,
          postedOn: input.postedOn,
          amount,
          description,
          reversalOfId: null,
          createdById: tenant.userId,
        },
        transaction,
      );
      const code = formatVoucherCode(
        voucherType,
        input.postedOn,
        voucherNumber,
      );
      await this.audit.record(
        {
          action: 'CASH_TRANSACTION_POSTED',
          entity: 'CashTransaction',
          entityId: line.id,
          actor: tenant,
          changes: {
            direction: { from: null, to: input.direction },
            amount: { from: null, to: amount },
            voucher: { from: null, to: code },
          },
        },
        transaction,
      );
      return {
        transactionId: line.id,
        voucherCode: code,
        direction: input.direction,
        amount,
      };
    });
  }

  async reverse(
    tenant: TenantContext,
    input: ReverseMovementInput,
  ): Promise<CashMovementReceiptView> {
    const scope = requireCongregationScope(
      tenant,
      'reversar movimientos de caja',
    );
    const original = await this.book.findLine(scope, input.transactionId);
    if (!original) {
      throw new NotFoundDomainException('El movimiento no existe en la sede.');
    }
    const reason = input.reason.trim();
    if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
      throw new InvalidInputException(
        'Describe el motivo de la reversa (de 10 a 200 caracteres).',
        'REVERSAL_REASON_REQUIRED',
      );
    }
    const periods = await this.book.listPeriods(scope);
    const block = reversalBlockOf(original, periods);
    if (block) {
      throw BLOCK_ERRORS[block]();
    }
    this.requireNotFuture(input.postedOn, 'La fecha de la reversa');
    const period = this.openPeriodIn(periods, input.postedOn);

    const voucherType = original.direction === 'IN' ? 'CE' : 'CI';
    const originalCode = voucherCodeOf(original.voucher);
    const consolidation = isConsolidation(original);

    return this.transactions.run(async (transaction) => {
      const voucherNumber = await this.numbering.nextVoucherNumber(
        scope,
        voucherType,
        transaction,
      );
      const voucher = await this.book.createVoucher(
        scope,
        { type: voucherType, number: voucherNumber, issuedOn: input.postedOn },
        transaction,
      );
      const direction: Direction = original.direction === 'IN' ? 'OUT' : 'IN';
      const reversal = await this.book.createTransaction(
        scope,
        {
          periodId: period.id,
          accountId: original.accountId,
          fundId: original.fundId,
          voucherId: voucher.id,
          direction,
          postedOn: input.postedOn,
          amount: original.amount,
          description: `Reversa de ${originalCode}: ${reason}`.slice(
            0,
            MAX_DESCRIPTION,
          ),
          reversalOfId: original.id,
          createdById: tenant.userId,
        },
        transaction,
      );
      // Reversing a consolidation gives its contributions back, so they can be consolidated again.
      const released = consolidation
        ? await this.book.releaseContributions(scope, original.id, transaction)
        : 0;
      const code = formatVoucherCode(
        voucherType,
        input.postedOn,
        voucherNumber,
      );
      await this.audit.record(
        {
          action: 'CASH_TRANSACTION_REVERSED',
          entity: 'CashTransaction',
          entityId: original.id,
          actor: tenant,
          changes: {
            ...buildAuditChanges(
              { direction: original.direction, amount: original.amount },
              { direction, amount: original.amount },
              ['direction', 'amount'],
            ),
            voucher: { from: originalCode, to: code },
            releasedContributions: { from: null, to: released },
          },
        },
        transaction,
      );
      return {
        transactionId: reversal.id,
        voucherCode: code,
        direction,
        amount: original.amount,
      };
    });
  }

  // --- Rules ---------------------------------------------------------------------------------------

  private validAmount(raw: number): number {
    const cents = toCents(raw);
    if (!Number.isFinite(raw) || cents <= 0 || raw > MAX_MONEY_AMOUNT) {
      throw new InvalidInputException(
        'El valor del movimiento debe ser mayor que cero.',
        'INVALID_AMOUNT',
      );
    }
    return fromCents(cents);
  }

  /** Cash lines are never dated after today, like contributions and consolidations. */
  private requireNotFuture(date: string, subject: string): void {
    if (!isIsoDate(date)) {
      throw new InvalidInputException('La fecha no es válida.', 'INVALID_DATE');
    }
    if (date > this.clock.today()) {
      throw new InvalidInputException(
        `${subject} no puede ser posterior a hoy.`,
        'FUTURE_DATE',
      );
    }
  }

  private async openPeriodFor(
    scope: TenantScope,
    date: string,
  ): Promise<PeriodRecord> {
    return this.openPeriodIn(await this.book.listPeriods(scope), date);
  }

  private openPeriodIn(
    periods: readonly PeriodRecord[],
    date: string,
  ): PeriodRecord {
    const wanted: YearMonth = yearMonthOf(date);
    const period = periods.find(
      (candidate) =>
        candidate.year === wanted.year && candidate.month === wanted.month,
    );
    if (!period) {
      throw new NotFoundDomainException(
        'La sede no tiene abierto el periodo contable de esa fecha. Ábrelo desde la configuración contable.',
        'PERIOD_NOT_FOUND',
      );
    }
    if (period.status !== 'OPEN') {
      throw new ConflictDomainException(
        'El periodo contable de esa fecha está cerrado: elige una fecha de un periodo abierto.',
        'PERIOD_CLOSED',
      );
    }
    return period;
  }
}
