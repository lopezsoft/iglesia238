import { Inject, Injectable } from '@nestjs/common';
import { Page, buildPage } from '../../../common/pagination/page.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { requirePlatformScope } from './denomination-rules.js';
import {
  DENOMINATION_REPOSITORY,
  type DenominationListFilter,
  type DenominationRepository,
} from './denomination.repository.port.js';
import {
  type DenominationSummaryView,
  toDenominationView,
} from './denomination.view.js';

export interface DenominationStatsView {
  readonly total: number;
  readonly active: number;
  readonly congregations: number;
}

@Injectable()
export class ListDenominationsUseCase {
  constructor(
    @Inject(DENOMINATION_REPOSITORY)
    private readonly denominations: DenominationRepository,
  ) {}

  async execute(
    context: TenantContext,
    filter: DenominationListFilter,
  ): Promise<Page<DenominationSummaryView>> {
    requirePlatformScope(context);
    const { items, total } = await this.denominations.list(filter);
    return buildPage(items.map(toDenominationView), total, filter);
  }
}

@Injectable()
export class GetDenominationStatsUseCase {
  constructor(
    @Inject(DENOMINATION_REPOSITORY)
    private readonly denominations: DenominationRepository,
  ) {}

  async execute(context: TenantContext): Promise<DenominationStatsView> {
    requirePlatformScope(context);
    return this.denominations.counts();
  }
}
