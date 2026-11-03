import { Inject, Injectable } from '@nestjs/common';
import {
  fromCents,
  toCents,
} from '../../../common/accounting/accounting-rules.js';
import { formatVoucherCode } from '../../../common/numbering/document-numbering.service.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import { TITHE_SETTLEMENT_LEDGER } from './tithe-settlement.config.js';
import { TitheDraftService } from './tithe-draft.service.js';
import { toContributionRow, toRuleView } from './tithe-settlement.mappers.js';
import type {
  TitheRangeView,
  TithePreview,
} from './tithe-settlement.models.js';
import { TITHE_SETTLEMENT_READER } from './tithe-settlement.ports.js';
import type { TitheSettlementReader } from './tithe-settlement.ports.js';

@Injectable()
export class PreviewTitheSettlementUseCase {
  constructor(
    private readonly drafts: TitheDraftService,
    @Inject(TITHE_SETTLEMENT_READER)
    private readonly settlements: TitheSettlementReader,
  ) {}

  async execute(
    tenant: TenantContext,
    range: TitheRangeView,
  ): Promise<TithePreview> {
    const scope = requireCongregationScope(
      tenant,
      'calcular la liquidación del diezmo',
    );
    const draft = await this.drafts.build(scope, range);
    const nextNumber = await this.settlements.peekNextVoucherNumber(scope);
    const settleable = draft.settleable;

    return {
      from: range.from,
      to: range.to,
      congregationName: draft.congregation.name,
      denominationName: draft.congregation.denominationName,
      localFundName: draft.bookings.localFundName,
      count: settleable.length,
      contributorCount: new Set(
        settleable.flatMap((tithe) =>
          tithe.personId === null ? [] : [tithe.personId],
        ),
      ).size,
      anonymousCount: settleable.filter((tithe) => tithe.personId === null)
        .length,
      excludedCount: draft.excludedCount,
      grossTithe: draft.grossTithe,
      rule: toRuleView(draft.rule, draft.rule.id),
      components: draft.components,
      componentsTotal: fromCents(
        draft.components.reduce(
          (sum, component) => sum + toCents(component.amount),
          0,
        ),
      ),
      contributions: settleable.map(toContributionRow),
      nextNumber: formatVoucherCode(
        TITHE_SETTLEMENT_LEDGER.voucherType,
        draft.today,
        nextNumber,
      ),
    };
  }
}
