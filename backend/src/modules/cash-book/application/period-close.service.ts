import { Inject, Injectable } from '@nestjs/common';
import {
  monthRange,
  nextMonth,
} from '../../../common/accounting/accounting-rules.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import {
  toPeriodView,
  type PeriodView,
} from '../../../common/accounting/period-view.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  ConflictDomainException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  CASH_BOOK_REPOSITORY,
  type CashBookRepository,
} from './cash-book.repository.js';
import { closeBlockOf } from './cash-book-rules.js';

const pad = (month: number) => String(month).padStart(2, '0');

/**
 * Closes an accounting period. Periods close in order, only after their month has ended and with every
 * contribution consolidated. Closing opens the next month; closing December also carries each fund's
 * balance into the opening balance of the new year, so the books do not restart from zero.
 */
@Injectable()
export class PeriodCloseService {
  constructor(
    @Inject(CASH_BOOK_REPOSITORY) private readonly book: CashBookRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async close(tenant: TenantContext, periodId: number): Promise<PeriodView> {
    const scope = requireCongregationScope(tenant, 'cerrar periodos contables');
    const period = await this.book.findPeriod(scope, periodId);
    if (!period) {
      throw new NotFoundDomainException(
        'El periodo contable no existe en la sede.',
        'PERIOD_NOT_FOUND',
      );
    }
    const { from, to } = monthRange(period);
    const [periods, pending] = await Promise.all([
      this.book.listPeriods(scope),
      this.book.countPendingContributions(scope, from, to),
    ]);
    const block = closeBlockOf({
      period,
      periods,
      today: this.clock.today(),
      pendingContributions: pending,
    });
    if (block) {
      throw new ConflictDomainException(block.message, block.code);
    }

    return this.transactions.run(async (transaction) => {
      const closed = await this.book.closePeriod(
        scope,
        period.id,
        this.clock.now(),
        transaction,
      );
      const next = nextMonth(period);
      await this.book.ensurePeriod(scope, next, transaction);
      const carried =
        period.month === 12
          ? await this.book.carryOpeningBalances(
              scope,
              period.year,
              transaction,
            )
          : 0;
      await this.audit.record(
        {
          action: 'PERIOD_CLOSED',
          entity: 'AccountingPeriod',
          entityId: period.id,
          actor: tenant,
          changes: {
            status: { from: 'OPEN', to: 'CLOSED' },
            period: { from: null, to: `${period.year}-${pad(period.month)}` },
            nextPeriod: { from: null, to: `${next.year}-${pad(next.month)}` },
            ...(period.month === 12
              ? { carriedBalances: { from: null, to: carried } }
              : {}),
          },
        },
        transaction,
      );
      return toPeriodView(closed);
    });
  }
}
