import {
  BusinessRuleException,
  ConflictDomainException,
  ErrorCode,
  InvalidInputException,
} from '../../../common/errors/domain.exception.js';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import {
  describeCrossTenantIsolation,
  expectNotFound,
} from '../../../../test/support/cross-tenant.js';
import {
  TENANT_A,
  buildTenantContext,
} from '../../../../test/support/tenants.js';
import { ConfirmTitheSettlementUseCase } from './confirm-tithe-settlement.use-case.js';
import { GetTitheOverviewUseCase } from './get-tithe-overview.use-case.js';
import {
  GetTitheSettlementUseCase,
  ListTitheSettlementsUseCase,
} from './list-tithe-settlements.use-case.js';
import { PreviewTitheSettlementUseCase } from './preview-tithe-settlement.use-case.js';
import { TitheDraftService } from './tithe-draft.service.js';
import type { BookingTarget } from './tithe-settlement.models.js';
import {
  FakeAudit,
  FakeClock,
  FakeTransactionRunner,
  InMemoryTitheLedger,
  fakeNumbering,
} from './testing/tithe-fakes.js';
import type { FakeTithe } from './testing/tithe-fakes.js';
import { VoidTitheSettlementUseCase } from './void-tithe-settlement.use-case.js';

const TODAY = '2026-11-02';
const OCTOBER = { from: '2026-10-01', to: '2026-10-31' };
const OCTOBER_GROSS = 3_230_000;
const PERMISSIONS = ['tithe-settlements.write'];

const NATIONAL: BookingTarget = {
  accountId: 50,
  accountCode: '530505',
  accountName: 'Cuota de la denominación por diezmos',
  fundId: 1,
  fundName: 'Fondo Local',
  fundIsActive: true,
};
const PASTOR: BookingTarget = {
  accountId: 51,
  accountCode: '530510',
  accountName: 'Sostenimiento pastoral',
  fundId: 1,
  fundName: 'Fondo Local',
  fundIsActive: true,
};

function tithe(
  id: number,
  amount: number,
  receivedOn: string,
  overrides: Partial<FakeTithe> = {},
): FakeTithe {
  return {
    id,
    denominationId: 1,
    congregationId: 10,
    receivedOn,
    amount,
    status: 'RECORDED',
    titheSettlementId: null,
    personId: id,
    contributorName: `Aportante ${id}`,
    memberCode: `SC-${String(id).padStart(4, '0')}`,
    paymentMethod: 'CASH',
    receiptNumber: `REC-2026-${String(id).padStart(5, '0')}`,
    ...overrides,
  };
}

function harness() {
  const ledger = new InMemoryTitheLedger();
  ledger.congregations.set(10, {
    denominationId: 1,
    name: 'Sede Central',
    denominationName: 'Monte de Sion',
  });
  ledger.congregations.set(11, {
    denominationId: 1,
    name: 'Sede Norte',
    denominationName: 'Monte de Sion',
  });
  ledger.congregations.set(20, {
    denominationId: 2,
    name: 'Sede Vida',
    denominationName: 'Vida Nueva',
  });
  for (const [denominationId, congregationId] of [
    [1, 10],
    [1, 11],
    [2, 20],
  ]) {
    ledger.periods.push({
      id: congregationId,
      denominationId,
      congregationId,
      year: 2026,
      month: 11,
      status: 'OPEN',
    });
  }
  ledger.rules.push({
    id: 1,
    denominationId: 1,
    effectiveFrom: '2026-01-01',
    nationalShareRate: 0.1,
    localFundRate: 0.3,
  });
  ledger.bookings = {
    nationalShare: NATIONAL,
    pastorNet: PASTOR,
    localFundName: 'Fondo Local',
  };
  const amounts = [
    500_000, 400_000, 300_000, 450_000, 380_000, 250_000, 350_000, 300_000,
    300_000,
  ];
  ledger.tithes = [
    ...amounts.map((amount, index) =>
      tithe(index + 1, amount, `2026-10-${String(index + 1).padStart(2, '0')}`),
    ),
    tithe(10, 300_000, '2026-10-05', { status: 'VOIDED' }),
    tithe(11, 100_000, '2026-10-12', {
      status: 'VOIDED',
      personId: null,
      contributorName: null,
      memberCode: null,
    }),
  ];

  const clock = new FakeClock(TODAY);
  const audit = new FakeAudit();
  const runner = new FakeTransactionRunner();
  const numbering = fakeNumbering();
  const drafts = new TitheDraftService(ledger, ledger, clock);
  return {
    ledger,
    clock,
    audit,
    overview: new GetTitheOverviewUseCase(ledger, ledger, clock),
    preview: new PreviewTitheSettlementUseCase(drafts, ledger),
    confirm: new ConfirmTitheSettlementUseCase(
      drafts,
      numbering.service,
      runner,
      ledger,
      ledger,
      audit,
    ),
    voidUseCase: new VoidTitheSettlementUseCase(
      runner,
      ledger,
      ledger,
      audit,
      clock,
    ),
    list: new ListTitheSettlementsUseCase(ledger),
    detail: new GetTitheSettlementUseCase(ledger),
    treasurer: buildTenantContext({ permissions: PERMISSIONS }),
  };
}

describe('PreviewTitheSettlementUseCase', () => {
  it('previews the recorded, unsettled tithes of the range with the rule in force', async () => {
    const { preview, treasurer } = harness();

    const result = await preview.execute(treasurer, OCTOBER);

    expect(result.count).toBe(9);
    expect(result.excludedCount).toBe(2);
    expect(result.grossTithe).toBe(OCTOBER_GROSS);
    expect(result.rule).toMatchObject({
      nationalShareRate: 0.1,
      localFundRate: 0.3,
      inForce: true,
    });
    expect(result.components.map((c) => [c.key, c.amount])).toEqual([
      ['NATIONAL', 323_000],
      ['LOCAL_FUND', 872_100],
      ['PASTOR', 2_034_900],
    ]);
    expect(result.componentsTotal).toBe(result.grossTithe);
    expect(result.contributions.reduce((sum, c) => sum + c.amount, 0)).toBe(
      OCTOBER_GROSS,
    );
    expect(
      result.contributions[0].receivedOn <= result.contributions[8].receivedOn,
    ).toBe(true);
    expect(result.nextNumber).toBe('LD-2026-00001');
    expect(result.congregationName).toBe('Sede Central');
    expect(result.denominationName).toBe('Monte de Sion');
  });

  it('shows where each payable component is booked and none for the local fund', async () => {
    const { preview, treasurer } = harness();

    const { components } = await preview.execute(treasurer, OCTOBER);

    expect(components.find((c) => c.key === 'NATIONAL')?.booking).toEqual({
      accountCode: '530505',
      accountName: NATIONAL.accountName,
      fundName: 'Fondo Local',
    });
    expect(components.find((c) => c.key === 'LOCAL_FUND')?.booking).toBeNull();
  });

  it('answers an empty draft for a range without tithes', async () => {
    const { preview, treasurer } = harness();

    const result = await preview.execute(treasurer, {
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(result).toMatchObject({
      count: 0,
      grossTithe: 0,
      componentsTotal: 0,
    });
  });

  it('rejects invalid, future and overlapping ranges', async () => {
    const { preview, confirm, treasurer } = harness();
    await confirm.execute(treasurer, OCTOBER, null);

    await expect(
      preview.execute(treasurer, { from: '2026-10-31', to: '2026-10-01' }),
    ).rejects.toMatchObject({ code: 'INVALID_RANGE' });
    await expect(
      preview.execute(treasurer, { from: 'ayer', to: '2026-10-01' }),
    ).rejects.toMatchObject({ code: 'INVALID_RANGE' });
    await expect(
      preview.execute(treasurer, { from: '2026-11-01', to: '2026-11-30' }),
    ).rejects.toMatchObject({ code: 'FUTURE_RANGE' });
    await expect(
      preview.execute(treasurer, { from: '2026-09-15', to: '2026-10-15' }),
    ).rejects.toBeInstanceOf(ConflictDomainException);
    await expect(
      preview.execute(treasurer, { from: '2026-09-15', to: '2026-10-15' }),
    ).rejects.toMatchObject({ code: 'OVERLAPPING_SETTLEMENT' });
  });

  it('refuses to preview when the denomination has no percentages', async () => {
    const { preview, ledger, treasurer } = harness();
    ledger.rules = [];

    await expect(preview.execute(treasurer, OCTOBER)).rejects.toMatchObject({
      code: 'RULE_NOT_FOUND',
    });
    await expect(preview.execute(treasurer, OCTOBER)).rejects.toBeInstanceOf(
      BusinessRuleException,
    );
  });

  it('needs a sede: the denomination-wide scope is told to pick one', async () => {
    const { preview } = harness();
    const wide = buildTenantContext({
      kind: 'DENOMINATION',
      permissions: PERMISSIONS,
    });

    await expect(preview.execute(wide, OCTOBER)).rejects.toMatchObject({
      code: ErrorCode.CONGREGATION_SCOPE_REQUIRED,
    });
    await expect(preview.execute(wide, OCTOBER)).rejects.toBeInstanceOf(
      InvalidInputException,
    );
  });

  it('is not available in the platform scope', async () => {
    const { preview } = harness();
    const platform = buildTenantContext({
      kind: 'PLATFORM',
      permissions: PERMISSIONS,
    });

    await expect(preview.execute(platform, OCTOBER)).rejects.toMatchObject({
      code: ErrorCode.PLATFORM_SCOPE_NOT_ALLOWED,
    });
  });
});

describe('ConfirmTitheSettlementUseCase', () => {
  it('copies the rule, settles the tithes, books the payables and audits', async () => {
    const { confirm, ledger, audit, treasurer } = harness();

    const row = await confirm.execute(treasurer, OCTOBER, '10.0.0.8');

    expect(row).toMatchObject({
      status: 'ISSUED',
      number: 'LD-2026-00001',
      grossTithe: OCTOBER_GROSS,
      contributionCount: 9,
      nationalShareRate: 0.1,
      localFundRate: 0.3,
    });
    expect(row.nationalShare + row.localFundShare + row.pastorNet).toBe(
      OCTOBER_GROSS,
    );
    expect(
      ledger.tithes.filter((t) => t.titheSettlementId === row.id),
    ).toHaveLength(9);
    expect(
      ledger.cash.map((line) => [line.direction, line.amount, line.accountId]),
    ).toEqual([
      ['OUT', 323_000, 50],
      ['OUT', 2_034_900, 51],
    ]);
    expect(ledger.cash[0].description).toBe(
      'Participación nacional del diezmo · LD-2026-00001',
    );
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'TITHE_SETTLED',
      entity: 'TitheSettlement',
      entityId: row.id,
      ipAddress: '10.0.0.8',
    });
    expect(JSON.stringify(audit.entries[0].changes)).not.toContain('Aportante');
  });

  it('keeps the percentages of an issued settlement when the rule changes later', async () => {
    const { confirm, ledger, treasurer } = harness();
    const row = await confirm.execute(treasurer, OCTOBER, null);

    ledger.rules.push({
      id: 2,
      denominationId: 1,
      effectiveFrom: '2026-11-01',
      nationalShareRate: 0.2,
      localFundRate: 0.05,
    });

    const stored = ledger.settlements.find((s) => s.id === row.id);
    expect(stored).toMatchObject({
      nationalShareRate: 0.1,
      nationalShare: 323_000,
    });
    await expect(
      confirm.execute(treasurer, OCTOBER, null),
    ).rejects.toMatchObject({ code: 'OVERLAPPING_SETTLEMENT' });
  });

  it('issues consecutive numbers, one sequence per sede', async () => {
    const { confirm, treasurer, ledger } = harness();
    ledger.tithes.push(tithe(20, 50_000, '2026-11-01'));

    const first = await confirm.execute(treasurer, OCTOBER, null);
    const second = await confirm.execute(
      treasurer,
      { from: '2026-11-01', to: '2026-11-02' },
      null,
    );

    expect([first.number, second.number]).toEqual([
      'LD-2026-00001',
      'LD-2026-00002',
    ]);
  });

  it('refuses a range without settleable tithes', async () => {
    const { confirm, treasurer } = harness();

    await expect(
      confirm.execute(
        treasurer,
        { from: '2026-06-01', to: '2026-06-30' },
        null,
      ),
    ).rejects.toMatchObject({ code: 'NO_TITHES' });
  });

  it('refuses when the accounting period of today is missing or closed', async () => {
    const { confirm, ledger, treasurer } = harness();
    ledger.periods = [];
    await expect(
      confirm.execute(treasurer, OCTOBER, null),
    ).rejects.toMatchObject({ code: 'PERIOD_NOT_FOUND' });

    ledger.periods.push({
      id: 10,
      denominationId: 1,
      congregationId: 10,
      year: 2026,
      month: 11,
      status: 'CLOSED',
    });
    await expect(
      confirm.execute(treasurer, OCTOBER, null),
    ).rejects.toMatchObject({ code: 'PERIOD_CLOSED' });
    expect(ledger.settlements).toHaveLength(0);
  });

  it('is atomic: an inactive payable fund leaves no settlement, link nor cash line', async () => {
    const { confirm, ledger, audit, treasurer } = harness();
    ledger.bookings = {
      ...ledger.bookings,
      nationalShare: { ...NATIONAL, fundIsActive: false },
    };

    await expect(
      confirm.execute(treasurer, OCTOBER, null),
    ).rejects.toMatchObject({ code: 'FUND_INACTIVE' });

    expect(ledger.settlements).toHaveLength(0);
    expect(ledger.cash).toHaveLength(0);
    expect(ledger.tithes.some((t) => t.titheSettlementId !== null)).toBe(false);
    expect(audit.entries).toHaveLength(0);

    ledger.bookings = { ...ledger.bookings, nationalShare: NATIONAL };
    await expect(
      confirm.execute(treasurer, OCTOBER, null),
    ).resolves.toMatchObject({ status: 'ISSUED' });
  });

  it('skips the cash line of a component whose account is not in the chart', async () => {
    const { confirm, ledger, treasurer } = harness();
    ledger.bookings = { ...ledger.bookings, nationalShare: null };

    await confirm.execute(treasurer, OCTOBER, null);

    expect(ledger.cash.map((line) => line.accountId)).toEqual([51]);
  });

  it('needs a sede and tenant scope', async () => {
    const { confirm } = harness();

    await expect(
      confirm.execute(
        buildTenantContext({ kind: 'DENOMINATION', permissions: PERMISSIONS }),
        OCTOBER,
        null,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.CONGREGATION_SCOPE_REQUIRED });
  });
});

describe('VoidTitheSettlementUseCase', () => {
  it('voids with a reason, releases the tithes, reverses the payables and audits', async () => {
    const { confirm, voidUseCase, preview, ledger, audit, treasurer } =
      harness();
    const issued = await confirm.execute(treasurer, OCTOBER, null);

    await expect(
      voidUseCase.execute(treasurer, issued.id, 'corto', null),
    ).rejects.toMatchObject({ code: 'VOID_REASON_REQUIRED' });
    const row = await voidUseCase.execute(
      treasurer,
      issued.id,
      '  Se omitieron transferencias del último día del rango ',
      '10.0.0.8',
    );

    expect(row).toMatchObject({
      status: 'VOIDED',
      voidReason: 'Se omitieron transferencias del último día del rango',
      contributionCount: 0,
    });
    expect(ledger.tithes.some((t) => t.titheSettlementId !== null)).toBe(false);
    const reversals = ledger.cash.filter((line) => line.reversalOfId !== null);
    expect(reversals.map((line) => [line.direction, line.amount])).toEqual([
      ['IN', 323_000],
      ['IN', 2_034_900],
    ]);
    expect(reversals[0].description).toBe(
      'Reversa por anulación de la liquidación LD-2026-00001',
    );
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'TITHE_SETTLEMENT_VOIDED',
      entity: 'TitheSettlement',
    });

    await expect(
      voidUseCase.execute(
        treasurer,
        issued.id,
        'Segundo intento de anulación',
        null,
      ),
    ).rejects.toMatchObject({ code: 'ALREADY_VOIDED' });

    // The released range can be settled again.
    const again = await preview.execute(treasurer, OCTOBER);
    expect(again).toMatchObject({ count: 9, grossTithe: OCTOBER_GROSS });
  });

  it('refuses a reason that is too long', async () => {
    const { confirm, voidUseCase, treasurer } = harness();
    const issued = await confirm.execute(treasurer, OCTOBER, null);

    await expect(
      voidUseCase.execute(treasurer, issued.id, 'x'.repeat(256), null),
    ).rejects.toMatchObject({ code: 'VOID_REASON_REQUIRED' });
  });

  it('refuses when the period of today is closed', async () => {
    const { confirm, voidUseCase, ledger, treasurer } = harness();
    const issued = await confirm.execute(treasurer, OCTOBER, null);
    ledger.periods[0] = { ...ledger.periods[0], status: 'CLOSED' };

    await expect(
      voidUseCase.execute(
        treasurer,
        issued.id,
        'Anulación con periodo cerrado',
        null,
      ),
    ).rejects.toMatchObject({ code: 'PERIOD_CLOSED' });
    expect(ledger.settlements[0].status).toBe('ISSUED');
  });

  describeCrossTenantIsolation('VoidTitheSettlementUseCase', {
    arrange: (owner: TenantScope) => {
      const world = sharedWorld();
      return world.issueFor(owner);
    },
    act: (scope: TenantScope, id) => {
      const world = sharedWorld();
      return world.voidUseCase.execute(
        world.contextOf(scope),
        id,
        'Anulación de prueba aislada',
        null,
      );
    },
  });
});

describe('listing and detail', () => {
  it('lists the history of the sede, newest first, filtered and paginated', async () => {
    const { confirm, list, treasurer, ledger } = harness();
    ledger.tithes.push(tithe(20, 50_000, '2026-11-01'));
    await confirm.execute(treasurer, OCTOBER, null);
    await confirm.execute(
      treasurer,
      { from: '2026-11-01', to: '2026-11-02' },
      null,
    );

    const all = await list.execute(treasurer, {
      status: null,
      from: null,
      to: null,
      page: 1,
      pageSize: 1,
    });
    expect(all.total).toBe(2);
    expect(all.items).toHaveLength(1);
    expect(all.items[0].number).toBe('LD-2026-00002');

    const voided = await list.execute(treasurer, {
      status: 'VOIDED',
      from: null,
      to: null,
      page: 1,
      pageSize: 10,
    });
    expect(voided.total).toBe(0);
    await expect(
      list.execute(treasurer, {
        status: null,
        from: '2026-12-01',
        to: '2026-01-01',
        page: 1,
        pageSize: 10,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RANGE' });
  });

  it('returns the overview with the rule in force and the year summary', async () => {
    const { confirm, overview, treasurer } = harness();
    await confirm.execute(treasurer, OCTOBER, null);

    const result = await overview.execute(treasurer);

    expect(result).toMatchObject({
      today: TODAY,
      congregationScoped: true,
      congregationName: 'Sede Central',
      lastIssued: OCTOBER,
      rule: { nationalShareRate: 0.1, inForce: true },
      yearSummary: { year: 2026, issuedCount: 1, grossTithe: OCTOBER_GROSS },
    });
  });

  it('answers the denomination-wide overview without settlements', async () => {
    const { overview } = harness();

    const result = await overview.execute(
      buildTenantContext({ kind: 'DENOMINATION', permissions: PERMISSIONS }),
    );

    expect(result).toMatchObject({
      congregationScoped: false,
      congregationName: 'todas las sedes',
      lastIssued: null,
      yearSummary: null,
    });
    expect(result.rule).not.toBeNull();
  });

  describeCrossTenantIsolation('GetTitheSettlementUseCase', {
    arrange: (owner: TenantScope) => sharedWorld().issueFor(owner),
    act: (scope: TenantScope, id) => {
      const world = sharedWorld();
      return world.detail.execute(world.contextOf(scope), id);
    },
  });

  it('does not list the settlements of another sede or denomination', async () => {
    const world = sharedWorld();
    await world.issueFor(TENANT_A);

    const other = await world.list.execute(
      world.contextOf(TenantScope.of(2, 20)),
      { status: null, from: null, to: null, page: 1, pageSize: 10 },
    );
    expect(other.total).toBe(0);
    await expectNotFound(
      world.detail.execute(world.contextOf(TenantScope.of(1, 11)), 1),
    );
  });
});

// One shared world per file so arrange and act of a cross-tenant case see the same data.
let world: ReturnType<typeof buildWorld> | undefined;

function buildWorld() {
  const base = harness();
  return {
    ...base,
    contextOf: (scope: TenantScope) =>
      buildTenantContext({
        kind: 'CONGREGATION',
        denominationId: scope.denominationId,
        congregationId: scope.congregationId,
        permissions: PERMISSIONS,
      }),
    async issueFor(owner: TenantScope): Promise<number> {
      const congregationId = owner.requireCongregationId();
      base.ledger.tithes.push(
        tithe(1000 + base.ledger.settlements.length, 10_000, '2026-10-10', {
          denominationId: owner.denominationId,
          congregationId,
          titheSettlementId: null,
        }),
      );
      base.ledger.rules.push({
        id: 90 + owner.denominationId,
        denominationId: owner.denominationId,
        effectiveFrom: '2026-01-01',
        nationalShareRate: 0.1,
        localFundRate: 0.3,
      });
      const row = await base.confirm.execute(
        buildTenantContext({
          kind: 'CONGREGATION',
          denominationId: owner.denominationId,
          congregationId,
          permissions: PERMISSIONS,
        }),
        { from: '2026-10-10', to: '2026-10-10' },
        null,
      );
      return row.id;
    },
  };
}

function sharedWorld(): ReturnType<typeof buildWorld> {
  world ??= buildWorld();
  return world;
}

beforeEach(() => {
  world = undefined;
});
