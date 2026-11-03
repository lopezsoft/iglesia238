import { Inject, Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  FINANCIAL_DATA_READER,
  type DataFilter,
  type FinancialDataReader,
} from './ports/financial-data.reader.js';
import type { CongregationData } from './report.models.js';

/** The sedes a report covers and how to call them. */
export interface ReportScope {
  readonly denominationId: number;
  /** Sedes in scope, in display order. */
  readonly congregations: readonly CongregationData[];
  /** True when the report adds every sede of the denomination (and shows the breakdown). */
  readonly wide: boolean;
  readonly label: string;
  /** Every sede of the denomination, to offer the narrowing filter; empty when the session is fixed on one sede. */
  readonly choices: readonly CongregationData[];
}

/**
 * Turns the tenant context (and an optional sede the person narrowed to) into the sedes a report adds.
 * The ids always come from the denomination of the session, never from the request.
 */
@Injectable()
export class ReportScopeResolver {
  constructor(
    @Inject(FINANCIAL_DATA_READER) private readonly reader: FinancialDataReader,
  ) {}

  async resolve(
    tenant: TenantContext,
    requestedCongregationId: number | null,
  ): Promise<ReportScope> {
    const scope = tenant.tenantScope();
    const all = await this.reader.listCongregations(scope.denominationId);
    const byId = (id: number) =>
      all.find((congregation) => congregation.id === id);

    if (scope.congregationId !== null) {
      if (
        requestedCongregationId !== null &&
        requestedCongregationId !== scope.congregationId
      ) {
        throw new NotFoundDomainException('La sede no existe.');
      }
      const own = byId(scope.congregationId);
      if (!own) {
        throw new NotFoundDomainException('La sede no existe.');
      }
      return {
        denominationId: scope.denominationId,
        congregations: [own],
        wide: false,
        label: own.name,
        choices: [],
      };
    }

    if (requestedCongregationId !== null) {
      const chosen = byId(requestedCongregationId);
      if (!chosen) {
        throw new NotFoundDomainException('La sede no existe.');
      }
      return {
        denominationId: scope.denominationId,
        congregations: [chosen],
        wide: false,
        label: chosen.name,
        choices: all,
      };
    }

    const denomination = await this.reader.denominationName(
      scope.denominationId,
    );
    return {
      denominationId: scope.denominationId,
      congregations: all,
      wide: true,
      label: `${denomination ?? 'La denominación'} (todas las sedes)`,
      choices: all,
    };
  }

  filterOf(scope: ReportScope, fundId: number | null): DataFilter {
    return {
      denominationId: scope.denominationId,
      congregationIds: scope.congregations.map(
        (congregation) => congregation.id,
      ),
      fundId,
    };
  }
}
