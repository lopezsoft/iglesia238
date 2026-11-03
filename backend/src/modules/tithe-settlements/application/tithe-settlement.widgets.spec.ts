import { buildTenantContext } from '../../../../test/support/tenants.js';
import { buildPeriodWindow } from '../../dashboard/application/period-window.js';
import { InMemoryTitheLedger } from './testing/tithe-fakes.js';
import { TitheSettlementWidgets } from './tithe-settlement.widgets.js';

function setup() {
  const ledger = new InMemoryTitheLedger();
  const widgets = new TitheSettlementWidgets(ledger);
  const tenant = buildTenantContext({
    permissions: ['tithe-settlements.write'],
  });
  const context = { tenant, window: buildPeriodWindow('today', '2026-11-02') };
  return { ledger, widgets, context };
}

describe('TitheSettlementWidgets', () => {
  it('invites the treasurer to settle when the sede never did', async () => {
    const { widgets, context } = setup();

    const { kpis } = await widgets.provide(context);

    expect(kpis?.[0]).toMatchObject({
      key: 'tithe-settlement',
      value: 'Sin liquidaciones',
      tone: 'orange',
      link: '/accounting/tithe-settlements',
    });
  });

  it('shows the date and the days since the last issued settlement', async () => {
    const { ledger, widgets, context } = setup();
    ledger.settlements.push({
      id: 1,
      denominationId: 1,
      congregationId: 10,
      voucherNumber: 1,
      settledOn: '2026-10-30',
      coveredFrom: '2026-10-01',
      coveredTo: '2026-10-29',
      grossTithe: 100,
      nationalShareRate: 0.1,
      localFundRate: 0.3,
      nationalShare: 10,
      localFundShare: 27,
      pastorNet: 63,
      status: 'ISSUED',
      voidReason: null,
    });

    const { kpis } = await widgets.provide(context);

    expect(kpis?.[0]).toMatchObject({
      value: '30/10/2026',
      hint: 'Hace 3 días',
      tone: 'green',
    });
  });

  it('ignores voided settlements and other sedes', async () => {
    const { ledger, widgets, context } = setup();
    const base = {
      voucherNumber: 1,
      settledOn: '2026-10-30',
      coveredFrom: '2026-10-01',
      coveredTo: '2026-10-29',
      grossTithe: 100,
      nationalShareRate: 0.1,
      localFundRate: 0.3,
      nationalShare: 10,
      localFundShare: 27,
      pastorNet: 63,
      voidReason: null,
    };
    ledger.settlements.push({
      ...base,
      id: 1,
      denominationId: 1,
      congregationId: 10,
      status: 'VOIDED',
    });
    ledger.settlements.push({
      ...base,
      id: 2,
      denominationId: 1,
      congregationId: 11,
      status: 'ISSUED',
    });
    ledger.settlements.push({
      ...base,
      id: 3,
      denominationId: 2,
      congregationId: 20,
      status: 'ISSUED',
    });

    const { kpis } = await widgets.provide(context);

    expect(kpis?.[0].value).toBe('Sin liquidaciones');
  });

  it('applies only to a sede with tithe-settlements.write', () => {
    const { widgets } = setup();

    expect(widgets.requiredPermissions).toEqual(['tithe-settlements.write']);
    expect(widgets.scopeKinds).toEqual(['CONGREGATION']);
  });
});
