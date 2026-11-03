import { Inject, Injectable } from '@nestjs/common';
import { ALL_CONGREGATIONS_LABEL } from '../../../common/accounting/congregation-lookup.port.js';
import {
  compareYearMonth,
  monthLabel,
  monthRange,
} from '../../../common/accounting/accounting-rules.js';
import { formatVoucherCode } from '../../../common/numbering/document-numbering.service.js';
import { VoucherTypes } from '../../../common/accounting/accounting-rules.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import type { PeriodStatus } from '../domain/contribution.types.js';
import type {
  ContributionFormOptions,
  PeriodOption,
} from './contribution.models.js';
import {
  CONTRIBUTIONS_REPOSITORY,
  type ContributionsRepository,
  type PeriodSummary,
} from './contributions.repository.js';

/**
 * Everything the registration form and the period selector need: types, periods, the dates that
 * are allowed, the settled tithe ranges and the receipt number the next contribution will get.
 */
@Injectable()
export class GetContributionFormOptionsUseCase {
  constructor(
    @Inject(CONTRIBUTIONS_REPOSITORY)
    private readonly repository: ContributionsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(tenant: TenantContext): Promise<ContributionFormOptions> {
    const scope = tenant.tenantScope();
    const today = this.clock.today();
    const sede = scope.congregationId !== null;

    const [types, periods, ranges, nextNumber, congregationName] =
      await Promise.all([
        this.repository.listActiveTypes(scope),
        this.repository.listPeriods(scope),
        sede ? this.repository.listIssuedTitheRanges(scope) : [],
        sede ? this.repository.peekNextReceiptNumber(scope) : null,
        sede ? this.repository.congregationName(scope) : null,
      ]);

    const options = collapseByMonth(periods);
    const open = sede
      ? options.filter((period) => period.status === 'OPEN')
      : [];
    const oldestOpen = open.at(-1);

    return {
      today,
      congregationScoped: sede,
      scopeLabel: congregationName ?? ALL_CONGREGATIONS_LABEL,
      types,
      periods: options,
      minDate: oldestOpen ? monthRange(oldestOpen).from : null,
      maxDate: open.length > 0 ? today : null,
      settledTitheRanges: ranges,
      nextReceiptNumber:
        nextNumber === null
          ? null
          : formatVoucherCode(VoucherTypes.receipt, today, nextNumber),
    };
  }
}

/**
 * One option per month, newest first. Denomination-wide, a month counts as open when any sede
 * still has it open.
 */
function collapseByMonth(periods: readonly PeriodSummary[]): PeriodOption[] {
  const byMonth = new Map<string, PeriodOption>();
  for (const period of periods) {
    const key = `${period.year}-${period.month}`;
    const known = byMonth.get(key);
    const status: PeriodStatus =
      known?.status === 'OPEN' || period.status === 'OPEN' ? 'OPEN' : 'CLOSED';
    byMonth.set(key, {
      year: period.year,
      month: period.month,
      status,
      label: monthLabel(period),
    });
  }
  return [...byMonth.values()].sort((a, b) => compareYearMonth(b, a));
}
