import { Inject, Injectable } from '@nestjs/common';
import {
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import { mapPage } from '../../../common/pagination/page.js';
import type { Page } from '../../../common/pagination/page.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import {
  toContributionRow,
  toSettlementRow,
} from './tithe-settlement.mappers.js';
import type {
  SettlementListQuery,
  TitheSettlementDetail,
  TitheSettlementRow,
} from './tithe-settlement.models.js';
import { TITHE_SETTLEMENT_READER } from './tithe-settlement.ports.js';
import type { TitheSettlementReader } from './tithe-settlement.ports.js';

@Injectable()
export class ListTitheSettlementsUseCase {
  constructor(
    @Inject(TITHE_SETTLEMENT_READER)
    private readonly settlements: TitheSettlementReader,
  ) {}

  async execute(
    tenant: TenantContext,
    query: SettlementListQuery,
  ): Promise<Page<TitheSettlementRow>> {
    const scope = requireCongregationScope(
      tenant,
      'consultar las liquidaciones del diezmo',
    );
    for (const date of [query.from, query.to]) {
      if (date !== null && !isIsoDate(date)) {
        throw new InvalidInputException(
          'Las fechas del filtro no son válidas.',
          'INVALID_RANGE',
        );
      }
    }
    if (query.from !== null && query.to !== null && query.from > query.to) {
      throw new InvalidInputException(
        'La fecha «hasta» debe ser igual o posterior a la fecha «desde».',
        'INVALID_RANGE',
      );
    }
    return mapPage(await this.settlements.list(scope, query), toSettlementRow);
  }
}

@Injectable()
export class GetTitheSettlementUseCase {
  constructor(
    @Inject(TITHE_SETTLEMENT_READER)
    private readonly settlements: TitheSettlementReader,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
  ): Promise<TitheSettlementDetail> {
    const scope = requireCongregationScope(
      tenant,
      'consultar las liquidaciones del diezmo',
    );
    const detail = await this.settlements.findDetail(scope, id);
    if (!detail) {
      throw new NotFoundDomainException('La liquidación no existe en la sede.');
    }
    return {
      ...toSettlementRow(detail.record),
      congregationName: detail.congregationName,
      voidedByName: detail.voidedByName,
      contributions: detail.contributions.map(toContributionRow),
      cashLines: detail.cashLines,
    };
  }
}
