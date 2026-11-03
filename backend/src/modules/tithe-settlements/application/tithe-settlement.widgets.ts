import { Inject, Injectable } from '@nestjs/common';
import { csvDate } from '../../../common/export/csv-document.js';
import { RegisterDashboardWidgets } from '../../dashboard/application/dashboard-widget-registry.js';
import type {
  DashboardContext,
  DashboardContribution,
  DashboardWidgetProvider,
} from '../../dashboard/application/dashboard.types.js';
import { TITHE_SETTLEMENT_READER } from './tithe-settlement.ports.js';
import type { TitheSettlementReader } from './tithe-settlement.ports.js';

const DAY_MS = 86_400_000;
/** A month and a half without settling the tithe is worth a warning. */
const STALE_AFTER_DAYS = 45;

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

/** When the sede last settled its tithe, for the treasurer. Settlements belong to one sede. */
@Injectable()
@RegisterDashboardWidgets()
export class TitheSettlementWidgets implements DashboardWidgetProvider {
  readonly key = 'tithe-settlement';
  readonly requiredPermissions = ['tithe-settlements.write'] as const;
  readonly scopeKinds = ['CONGREGATION'] as const;

  constructor(
    @Inject(TITHE_SETTLEMENT_READER)
    private readonly settlements: TitheSettlementReader,
  ) {}

  async provide({
    tenant,
    window,
  }: DashboardContext): Promise<DashboardContribution> {
    const page = await this.settlements.list(tenant.tenantScope(), {
      status: 'ISSUED',
      from: null,
      to: null,
      page: 1,
      pageSize: 1,
    });
    const last = page.items[0];
    const days = last ? daysBetween(last.settledOn, window.today) : null;

    return {
      kpis: [
        {
          key: 'tithe-settlement',
          order: 50,
          tab: 'general',
          label: 'Última liquidación del diezmo',
          value: last ? csvDate(last.settledOn) : 'Sin liquidaciones',
          format: 'text',
          hint:
            days === null
              ? 'Aún no se ha liquidado el diezmo de la sede'
              : days === 0
                ? 'Liquidada hoy'
                : `Hace ${days} ${days === 1 ? 'día' : 'días'}`,
          icon: 'percent',
          tone: days === null || days > STALE_AFTER_DAYS ? 'orange' : 'green',
          link: '/accounting/tithe-settlements',
          previous: null,
        },
      ],
    };
  }
}
