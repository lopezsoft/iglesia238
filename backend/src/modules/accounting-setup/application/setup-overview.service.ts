import { Inject, Injectable } from '@nestjs/common';
import {
  monthLabel,
  sameYearMonth,
  toCents,
  fromCents,
  yearMonthOf,
} from '../../../common/accounting/accounting-rules.js';
import {
  ALL_CONGREGATIONS_LABEL,
  CONGREGATION_LOOKUP,
  type CongregationLookup,
} from '../../../common/accounting/congregation-lookup.port.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { FundsService } from './funds.service.js';
import {
  PERIOD_REPOSITORY,
  type PeriodRepository,
} from './period.repository.js';
import type { SetupOverviewView } from './setup.views.js';
import { TitheRulesService } from './tithe-rules.service.js';

/** Summary at the top of the accounting setup: what is configured and what is still missing. */
@Injectable()
export class SetupOverviewService {
  constructor(
    private readonly funds: FundsService,
    private readonly titheRules: TitheRulesService,
    @Inject(PERIOD_REPOSITORY) private readonly periods: PeriodRepository,
    @Inject(CONGREGATION_LOOKUP)
    private readonly congregations: CongregationLookup,
    private readonly clock: Clock,
  ) {}

  async get(tenant: TenantContext): Promise<SetupOverviewView> {
    const scope = tenant.tenantScope();
    const today = this.clock.today();
    const congregationId = scope.congregationId;

    const [funds, titheRule, periods, congregationName] = await Promise.all([
      this.funds.list(tenant),
      this.titheRules.inForce(tenant),
      congregationId === null
        ? Promise.resolve(null)
        : this.periods.list(scope),
      congregationId === null
        ? Promise.resolve(null)
        : this.congregations.nameOf(scope, congregationId),
    ]);
    const active = funds.filter((fund) => fund.isActive);
    const current = periods?.find((period) =>
      sameYearMonth(period, yearMonthOf(today)),
    );

    return {
      today,
      year: yearMonthOf(today).year,
      activeFunds: active.length,
      totalFunds: funds.length,
      openingTotal: fromCents(
        active.reduce((sum, fund) => sum + toCents(fund.openingBalance), 0),
      ),
      currentPeriod: current
        ? {
            year: current.year,
            month: current.month,
            status: current.status,
            label: monthLabel(current),
          }
        : null,
      congregationScoped: congregationId !== null,
      scopeLabel:
        congregationId === null
          ? ALL_CONGREGATIONS_LABEL
          : (congregationName ?? ALL_CONGREGATIONS_LABEL),
      periodsCount: periods?.length ?? null,
      titheRule,
    };
  }
}
