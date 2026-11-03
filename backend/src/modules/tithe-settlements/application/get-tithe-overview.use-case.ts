import { Inject, Injectable } from '@nestjs/common';
import { yearMonthOf } from '../../../common/accounting/accounting-rules.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { toRuleView } from './tithe-settlement.mappers.js';
import type { TitheOverview } from './tithe-settlement.models.js';
import {
  TITHE_RULE_READER,
  TITHE_SETTLEMENT_READER,
} from './tithe-settlement.ports.js';
import type {
  TitheRuleReader,
  TitheSettlementReader,
} from './tithe-settlement.ports.js';

const ALL_CONGREGATIONS = 'todas las sedes';

@Injectable()
export class GetTitheOverviewUseCase {
  constructor(
    @Inject(TITHE_SETTLEMENT_READER)
    private readonly settlements: TitheSettlementReader,
    @Inject(TITHE_RULE_READER) private readonly rules: TitheRuleReader,
    private readonly clock: Clock,
  ) {}

  async execute(tenant: TenantContext): Promise<TitheOverview> {
    const scope = tenant.tenantScope();
    const today = this.clock.today();
    const rule = await this.rules.findInForce(scope.denominationId, today);
    const ruleView = rule ? toRuleView(rule, rule.id) : null;

    if (scope.congregationId === null) {
      return {
        today,
        congregationScoped: false,
        congregationName: ALL_CONGREGATIONS,
        rule: ruleView,
        lastIssued: null,
        yearSummary: null,
      };
    }

    const [congregation, lastIssued, yearSummary] = await Promise.all([
      this.settlements.findCongregation(scope),
      this.settlements.findLastIssuedRange(scope),
      this.settlements.summarizeYear(scope, yearMonthOf(today).year),
    ]);
    return {
      today,
      congregationScoped: true,
      congregationName: congregation?.name ?? '',
      rule: ruleView,
      lastIssued,
      yearSummary,
    };
  }
}
