import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { summarizeByCategory } from '../domain/contribution-rules.js';
import { toContributionRow } from './contribution-mappers.js';
import type { ContributionListing } from './contribution.models.js';
import {
  type ContributionQuery,
  resolvePeriod,
  toFilter,
} from './contribution-query.js';
import {
  CONTRIBUTIONS_REPOSITORY,
  type ContributionsRepository,
} from './contributions.repository.js';

export interface ListContributionsInput extends ContributionQuery {
  page: number;
  pageSize: number;
}

/**
 * Contributions of a month (or a date range) with filters, server-side pagination and the totals
 * per category. Denomination-wide the list covers every sede, read-only.
 */
@Injectable()
export class ListContributionsUseCase {
  constructor(
    @Inject(CONTRIBUTIONS_REPOSITORY)
    private readonly repository: ContributionsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    input: ListContributionsInput,
  ): Promise<ContributionListing> {
    const scope =
      input.congregationId !== undefined
        ? tenant.congregationScope(input.congregationId)
        : tenant.tenantScope();
    const period = resolvePeriod(input, this.clock.today());
    const filter = toFilter(input, period);

    const [page, breakdown, sedePeriod] = await Promise.all([
      this.repository.findPage(scope, filter, input),
      this.repository.breakdown(scope, filter),
      scope.congregationId !== null && period.month !== null
        ? this.repository.findPeriod(
            scope,
            period.month.year,
            period.month.month,
          )
        : null,
    ]);
    const { summary, totalAmount } = summarizeByCategory(breakdown.totals);

    return {
      items: page.items.map(toContributionRow),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      from: period.from,
      to: period.to,
      label: period.label,
      periodStatus: sedePeriod?.status ?? null,
      summary,
      totalAmount,
      voidedCount: breakdown.voidedCount,
    };
  }
}
