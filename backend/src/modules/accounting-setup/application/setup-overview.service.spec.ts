import {
  FakeAuditRecorder,
  FakeTransactionRunner,
  FixedClock,
  contextFor,
} from '../../../../test/support/accounting-doubles.js';
import {
  FakeCongregationLookup,
  InMemoryFundRepository,
  InMemoryPeriodRepository,
  InMemoryTitheRuleRepository,
} from '../../../../test/support/accounting-setup-fakes.js';
import {
  TENANT_A,
  TENANT_A_SIBLING,
  TENANT_A_WIDE,
} from '../../../../test/support/tenants.js';
import { FundsService } from './funds.service.js';
import { SetupOverviewService } from './setup-overview.service.js';
import { TitheRulesService } from './tithe-rules.service.js';

function setup() {
  const clock = FixedClock.at('2026-11-02');
  const funds = new InMemoryFundRepository();
  const periods = new InMemoryPeriodRepository();
  const rules = new InMemoryTitheRuleRepository();
  const transactions = new FakeTransactionRunner();
  const audit = new FakeAuditRecorder();
  const service = new SetupOverviewService(
    new FundsService(funds, transactions, audit, clock),
    new TitheRulesService(rules, transactions, audit, clock),
    periods,
    new FakeCongregationLookup(
      new Map([
        [10, 'Sede Central'],
        [11, 'Sede Norte'],
      ]),
    ),
    clock,
  );
  return { funds, periods, rules, service };
}

describe('SetupOverviewService', () => {
  it('summarizes a sede: active funds, opening total, current period and tithe rule', async () => {
    const { funds, periods, rules, service } = setup();
    const local = funds.add(1, 'Fondo Local');
    const missions = funds.add(1, 'Misiones');
    funds.add(1, 'Campamento 2025', false);
    funds.add(2, 'Fondo General');
    funds.openings.set(`10:${local.id}:2026`, 1_000_000);
    funds.openings.set(`10:${missions.id}:2026`, 250_000.5);
    funds.openings.set(`11:${local.id}:2026`, 999);
    periods.add(TENANT_A, 2026, 10, 'CLOSED');
    periods.add(TENANT_A, 2026, 11);
    rules.add(1, {
      effectiveFrom: '2026-01-01',
      nationalShareRate: 0.21,
      localFundRate: 0.03,
    });

    const overview = await service.get(contextFor(TENANT_A));

    expect(overview).toMatchObject({
      today: '2026-11-02',
      year: 2026,
      activeFunds: 2,
      totalFunds: 3,
      openingTotal: 1_250_000.5,
      congregationScoped: true,
      scopeLabel: 'Sede Central',
      periodsCount: 2,
      currentPeriod: {
        year: 2026,
        month: 11,
        status: 'OPEN',
        label: 'Noviembre 2026',
      },
      titheRule: { nationalShareRate: 0.21, inForce: true },
    });
  });

  it('reports what is missing in a new sede: no period and no tithe rule', async () => {
    const { funds, service } = setup();
    funds.add(1, 'Fondo Local');

    const overview = await service.get(contextFor(TENANT_A_SIBLING));

    expect(overview).toMatchObject({
      currentPeriod: null,
      periodsCount: 0,
      titheRule: null,
      scopeLabel: 'Sede Norte',
    });
  });

  it('adds the sedes up for a denomination-wide session', async () => {
    const { funds, periods, service } = setup();
    const local = funds.add(1, 'Fondo Local');
    funds.openings.set(`10:${local.id}:2026`, 100);
    funds.openings.set(`11:${local.id}:2026`, 50);
    periods.add(TENANT_A, 2026, 11);

    const overview = await service.get(contextFor(TENANT_A_WIDE));

    expect(overview).toMatchObject({
      openingTotal: 150,
      congregationScoped: false,
      scopeLabel: 'todas las sedes',
      currentPeriod: null,
      periodsCount: null,
    });
  });
});
