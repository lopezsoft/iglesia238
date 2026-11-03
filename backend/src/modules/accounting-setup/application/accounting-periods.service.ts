import { Inject, Injectable } from '@nestjs/common';
import {
  compareYearMonth,
  monthLabel,
  nextMonth,
  previousMonth,
  sameYearMonth,
  yearMonthOf,
  type YearMonth,
} from '../../../common/accounting/accounting-rules.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import {
  toPeriodView,
  type PeriodRecord,
  type PeriodView,
} from '../../../common/accounting/period-view.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  BusinessRuleException,
  ConflictDomainException,
  InvalidInputException,
} from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  PERIOD_REPOSITORY,
  type PeriodRepository,
} from './period.repository.js';

export interface OpenPeriodInput {
  readonly year: number;
  readonly month: number;
}

/**
 * Accounting periods of a sede. A new sede has none, and nothing can be recorded without an open one,
 * so the first period is opened from the setup. Later periods are opened when the previous one closes;
 * this service also lets the treasurer open the adjacent months by hand, never leaving a gap.
 */
@Injectable()
export class AccountingPeriodsService {
  constructor(
    @Inject(PERIOD_REPOSITORY) private readonly periods: PeriodRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  /** Newest first. A denomination-wide session has no periods of its own: the list is empty. */
  async list(tenant: TenantContext): Promise<PeriodView[]> {
    const scope = tenant.tenantScope();
    if (scope.congregationId === null) {
      return [];
    }
    return (await this.periods.list(scope)).map(toPeriodView);
  }

  async open(
    tenant: TenantContext,
    input: OpenPeriodInput,
  ): Promise<PeriodView> {
    const scope = requireCongregationScope(tenant, 'abrir periodos contables');
    if (
      !Number.isInteger(input.year) ||
      !Number.isInteger(input.month) ||
      input.month < 1 ||
      input.month > 12
    ) {
      throw new InvalidInputException(
        'Indica un año y un mes válidos.',
        'INVALID_PERIOD',
      );
    }
    const wanted: YearMonth = { year: input.year, month: input.month };
    const current = yearMonthOf(this.clock.today());

    if (wanted.year !== current.year) {
      // Opening balances are kept per year and set for the current one only.
      throw new BusinessRuleException(
        `Solo puedes abrir periodos del año en curso (${current.year}).`,
        'PERIOD_YEAR_NOT_ALLOWED',
      );
    }
    if (compareYearMonth(wanted, current) > 0) {
      throw new BusinessRuleException(
        'No puedes abrir un periodo posterior al mes en curso.',
        'PERIOD_IN_FUTURE',
      );
    }

    const existing = await this.periods.list(scope);
    if (existing.some((period) => sameYearMonth(period, wanted))) {
      throw new ConflictDomainException(
        `${monthLabel(wanted)} ya existe en la sede.`,
        'PERIOD_EXISTS',
      );
    }
    this.assertAdjacent(existing, wanted);

    const created = await this.transactions.run(async (transaction) => {
      const period = await this.periods.create(scope, wanted, transaction);
      await this.audit.record(
        {
          action: 'PERIOD_OPENED',
          entity: 'AccountingPeriod',
          entityId: period.id,
          actor: tenant,
          changes: {
            period: {
              from: null,
              to: `${wanted.year}-${String(wanted.month).padStart(2, '0')}`,
            },
          },
        },
        transaction,
      );
      return period;
    });
    return toPeriodView(created);
  }

  /** The first period can be any month of the year; the next ones must touch the existing range. */
  private assertAdjacent(
    existing: readonly PeriodRecord[],
    wanted: YearMonth,
  ): void {
    if (existing.length === 0) {
      return;
    }
    const sorted = existing.toSorted(compareYearMonth);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const isBefore = sameYearMonth(previousMonth(first), wanted);
    const isAfter = sameYearMonth(nextMonth(last), wanted);
    if (!isBefore && !isAfter) {
      throw new BusinessRuleException(
        `Solo puedes abrir ${monthLabel(previousMonth(first))} o ${monthLabel(nextMonth(last))}: los periodos no pueden dejar meses sin abrir.`,
        'PERIOD_NOT_ADJACENT',
      );
    }
  }
}
