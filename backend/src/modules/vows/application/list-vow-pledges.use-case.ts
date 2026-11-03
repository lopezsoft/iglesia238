import { Inject, Injectable } from '@nestjs/common';
import { ALL_CONGREGATIONS_LABEL } from '../../../common/accounting/congregation-lookup.port.js';
import {
  fromCents,
  toCents,
} from '../../../common/accounting/accounting-rules.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  isStalePledge,
  vowBalance,
  vowPledgeStatusFor,
  type VowPledgeStatus,
} from '../domain/vow-pledge-rules.js';
import { toVowPledgeRow } from './vow-pledge-mappers.js';
import type {
  VowKpis,
  VowPledgeFigures,
  VowsOverview,
} from './vow-pledge.models.js';
import {
  VOWS_REPOSITORY,
  type VowPledgeFilter,
  type VowsRepository,
} from './vows.repository.js';

export interface ListVowPledgesInput {
  page: number;
  pageSize: number;
  status?: VowPledgeStatus;
  contributionTypeId?: number;
  search?: string;
  overdueOnly?: boolean;
  congregationId?: number;
}

/** Pledges with their paid amount, balance and progress, paginated on the server, plus the KPIs of the scope. */
@Injectable()
export class ListVowPledgesUseCase {
  constructor(
    @Inject(VOWS_REPOSITORY) private readonly repository: VowsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    input: ListVowPledgesInput,
  ): Promise<VowsOverview> {
    const scope =
      input.congregationId !== undefined
        ? tenant.congregationScope(input.congregationId)
        : tenant.tenantScope();
    const today = this.clock.today();
    const filter: VowPledgeFilter = {
      status: input.status,
      contributionTypeId: input.contributionTypeId,
      search: input.search?.trim() || undefined,
      overdueOnly: input.overdueOnly,
      today,
    };

    const [page, counts, figures, vowTypes, congregationName] =
      await Promise.all([
        this.repository.findPage(scope, filter, input),
        this.repository.statusCounts(scope),
        this.repository.listFigures(scope),
        this.repository.listVowTypes(scope),
        scope.congregationId !== null
          ? this.repository.congregationName(scope)
          : null,
      ]);

    return {
      today,
      congregationScoped: scope.congregationId !== null,
      scopeLabel: congregationName ?? ALL_CONGREGATIONS_LABEL,
      vowTypes,
      kpis: computeKpis(figures, today),
      statusCounts: {
        ...counts,
        ALL: counts.ACTIVE + counts.FULFILLED + counts.CANCELLED,
      },
      items: page.items.map((record) => toVowPledgeRow(record, today)),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
    };
  }
}

/** KPIs of the pledges that are not cancelled; the paid amounts are exact in cents. */
export function computeKpis(
  figures: readonly VowPledgeFigures[],
  today: string,
): VowKpis {
  const live = figures.filter((figure) => figure.status !== 'CANCELLED');
  const pledgedCents = live.reduce(
    (sum, f) => sum + toCents(f.pledgedAmount),
    0,
  );
  const paidCents = live.reduce((sum, f) => sum + toCents(f.paid), 0);
  const active = live.filter(
    (f) => vowPledgeStatusFor(f.status, f.pledgedAmount, f.paid) === 'ACTIVE',
  );
  return {
    pledgedTotal: fromCents(pledgedCents),
    paidTotal: fromCents(paidCents),
    balanceTotal: fromCents(
      live.reduce(
        (sum, f) => sum + toCents(vowBalance(f.pledgedAmount, f.paid)),
        0,
      ),
    ),
    pledgeCount: live.length,
    withBalanceCount: live.filter(
      (f) => vowBalance(f.pledgedAmount, f.paid) > 0,
    ).length,
    activeCount: active.length,
    staleCount: active.filter((f) => isStalePledge(f, today)).length,
    overdueCount: active.filter((f) => f.dueOn !== null && f.dueOn < today)
      .length,
  };
}
