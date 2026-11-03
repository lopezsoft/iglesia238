import { Inject, Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { buildFinancialReport } from './financial-report.builder.js';
import {
  FINANCIAL_DATA_READER,
  type FinancialDataReader,
} from './ports/financial-data.reader.js';
import type { FinancialReport, ReportQuery } from './report.models.js';
import {
  addDays,
  assertReportRange,
  monthSpans,
  previousSpan,
} from './report-range.js';
import { ReportScopeResolver } from './report-scope.resolver.js';

const ALL_FUNDS = 'Todos los fondos';

/**
 * Income, expense and fund balances of a range for the sedes in scope. The cost is a handful of
 * grouped queries (one per month of the range plus a few more), all run in parallel.
 */
@Injectable()
export class GetFinancialReportUseCase {
  constructor(
    private readonly scopes: ReportScopeResolver,
    @Inject(FINANCIAL_DATA_READER) private readonly reader: FinancialDataReader,
  ) {}

  async execute(
    tenant: TenantContext,
    query: ReportQuery,
  ): Promise<FinancialReport> {
    assertReportRange(query);
    const scope = await this.scopes.resolve(tenant, query.congregationId);
    const funds = await this.reader.listFunds(scope.denominationId);
    const fund =
      query.fundId === null
        ? null
        : (funds.find((candidate) => candidate.id === query.fundId) ?? null);
    if (query.fundId !== null && !fund) {
      throw new NotFoundDomainException(
        'El fondo seleccionado no existe.',
        'FUND_NOT_FOUND',
      );
    }

    const filter = this.scopes.filterOf(scope, query.fundId);
    const year = Number(query.from.slice(0, 4));
    const spans = monthSpans(query);
    const previous = previousSpan(query);
    const beforeSpan = { from: `${year}-01-01`, to: addDays(query.from, -1) };

    const [
      accounts,
      contributionTypes,
      monthRows,
      previousRows,
      before,
      openingBalances,
      periods,
      contributionSums,
      pendingConsolidation,
    ] = await Promise.all([
      this.reader.listAccounts(scope.denominationId),
      this.reader.listContributionTypes(scope.denominationId),
      Promise.all(spans.map((span) => this.reader.sumCash(filter, span))),
      this.reader.sumCash(filter, previous),
      beforeSpan.to >= beforeSpan.from
        ? this.reader.sumCash(filter, beforeSpan)
        : Promise.resolve([]),
      this.reader.sumOpeningBalances(filter, year),
      this.reader.listPeriods(filter, year),
      this.reader.sumContributions(filter, query),
      this.reader.sumPendingConsolidation(filter, query),
    ]);

    return buildFinancialReport({
      query,
      scopeLabel: scope.label,
      fundLabel: fund?.name ?? ALL_FUNDS,
      accounts,
      funds,
      contributionTypes,
      congregations: scope.congregations,
      byCongregation: scope.wide,
      months: spans.map((span, index) => ({ span, rows: monthRows[index] })),
      previous: { span: previous, rows: previousRows },
      before,
      openingBalances,
      periods,
      contributionSums,
      pendingConsolidation,
    });
  }
}
