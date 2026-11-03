import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { compareSpanish } from '../../../common/text/comparable-text.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  FINANCIAL_DATA_READER,
  type FinancialDataReader,
} from './ports/financial-data.reader.js';
import type { ReportOptions } from './report.models.js';
import { ReportScopeResolver } from './report-scope.resolver.js';

@Injectable()
export class GetReportOptionsUseCase {
  constructor(
    private readonly scopes: ReportScopeResolver,
    @Inject(FINANCIAL_DATA_READER) private readonly reader: FinancialDataReader,
    private readonly clock: Clock,
  ) {}

  async execute(tenant: TenantContext): Promise<ReportOptions> {
    const scope = await this.scopes.resolve(tenant, null);
    const funds = await this.reader.listFunds(scope.denominationId);
    return {
      scopeLabel: scope.label,
      denominationWide: scope.wide,
      funds: funds
        .map(({ id, name, isActive }) => ({ id, name, isActive }))
        .sort((a, b) => compareSpanish(a.name, b.name)),
      congregations: scope.choices
        .filter((congregation) => congregation.isActive)
        .map(({ id, name, isActive }) => ({ id, name, isActive }))
        .sort((a, b) => compareSpanish(a.name, b.name)),
      today: this.clock.today(),
    };
  }
}
