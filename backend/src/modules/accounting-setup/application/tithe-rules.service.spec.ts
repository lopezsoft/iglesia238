import {
  FakeAuditRecorder,
  FakeTransactionRunner,
  FixedClock,
  contextFor,
} from '../../../../test/support/accounting-doubles.js';
import { InMemoryTitheRuleRepository } from '../../../../test/support/accounting-setup-fakes.js';
import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import { TENANT_A } from '../../../../test/support/tenants.js';
import { TitheRulesService } from './tithe-rules.service.js';

function build(today = '2026-11-02') {
  const rules = new InMemoryTitheRuleRepository();
  const audit = new FakeAuditRecorder();
  const service = new TitheRulesService(
    rules,
    new FakeTransactionRunner(),
    audit,
    FixedClock.at(today),
  );
  return { rules, audit, service };
}

const shared = build();

function setup() {
  return { ...build(), treasurer: contextFor(TENANT_A) };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as { code?: string } | null;
  return error?.code ?? 'NO_ERROR';
}

const input = {
  effectiveFrom: '2026-01-01',
  nationalShareRate: 0.21,
  localFundRate: 0.03,
};

describe('TitheRulesService', () => {
  it('starts empty: the system never proposes percentages', async () => {
    const { service, treasurer } = setup();

    expect(await service.list(treasurer)).toEqual([]);
    expect(await service.inForce(treasurer)).toBeNull();
  });

  it('registers the percentages a denomination enters and audits them', async () => {
    const { audit, service, treasurer } = setup();

    const rule = await service.create(treasurer, input);

    expect(rule).toMatchObject({
      effectiveFrom: '2026-01-01',
      nationalShareRate: 0.21,
      localFundRate: 0.03,
      inForce: true,
      inUse: false,
    });
    expect(audit.last).toMatchObject({
      action: 'TITHE_RULE_CREATED',
      entity: 'TitheSettlementRule',
    });
  });

  it('marks as in force only the newest rule that already started', async () => {
    const { rules, service, treasurer } = setup();
    rules.add(1, {
      effectiveFrom: '2025-01-01',
      nationalShareRate: 0.1,
      localFundRate: 0.3,
    });
    rules.add(1, {
      effectiveFrom: '2026-06-01',
      nationalShareRate: 0.15,
      localFundRate: 0.05,
    });
    rules.add(1, {
      effectiveFrom: '2027-01-01',
      nationalShareRate: 0.2,
      localFundRate: 0.05,
    });

    const list = await service.list(treasurer);

    expect(list.map((r) => [r.effectiveFrom, r.inForce])).toEqual([
      ['2027-01-01', false],
      ['2026-06-01', true],
      ['2025-01-01', false],
    ]);
  });

  it('validates the date and the rates', async () => {
    const { service, treasurer } = setup();

    expect(
      await codeOf(
        service.create(treasurer, { ...input, effectiveFrom: '2026-02-30' }),
      ),
    ).toBe('INVALID_DATE');
    expect(
      await codeOf(
        service.create(treasurer, { ...input, nationalShareRate: 1.2 }),
      ),
    ).toBe('INVALID_RATE');
    expect(
      await codeOf(
        service.create(treasurer, { ...input, localFundRate: -0.1 }),
      ),
    ).toBe('INVALID_RATE');
    expect(
      await codeOf(
        service.create(treasurer, { ...input, localFundRate: 0.12345 }),
      ),
    ).toBe('INVALID_RATE');
    // Four decimals are the precision of the column.
    await expect(
      service.create(treasurer, { ...input, localFundRate: 0.1225 }),
    ).resolves.toMatchObject({ localFundRate: 0.1225 });
  });

  it('does not repeat a start date, except for the rule being edited', async () => {
    const { rules, service, treasurer } = setup();
    const existing = rules.add(1, input);

    expect(await codeOf(service.create(treasurer, input))).toBe(
      'RULE_DATE_TAKEN',
    );
    await expect(
      service.update(treasurer, existing.id, {
        ...input,
        nationalShareRate: 0.22,
      }),
    ).resolves.toMatchObject({ nationalShareRate: 0.22 });
  });

  it('protects a rule once a settlement was issued under it', async () => {
    const { rules, service, treasurer } = setup();
    const old = rules.add(1, {
      effectiveFrom: '2025-01-01',
      nationalShareRate: 0.1,
      localFundRate: 0.3,
    });
    const current = rules.add(1, input);
    rules.settlements.push({ denominationId: 1, settledOn: '2025-08-10' });

    expect(
      await codeOf(
        service.update(treasurer, old.id, {
          ...input,
          effectiveFrom: '2025-01-01',
        }),
      ),
    ).toBe('RULE_IN_USE');
    expect(await codeOf(service.remove(treasurer, old.id))).toBe('RULE_IN_USE');
    // The newer rule has no settlements of its own yet.
    await service.remove(treasurer, current.id);
    expect(rules.rules.map((r) => r.id)).toEqual([old.id]);
  });

  it('ignores the settlements of another denomination', async () => {
    const { rules, service, treasurer } = setup();
    const rule = rules.add(1, input);
    rules.settlements.push({ denominationId: 2, settledOn: '2026-03-01' });

    await expect(service.remove(treasurer, rule.id)).resolves.toBeUndefined();
  });

  describeCrossTenantIsolation('editing a tithe rule', {
    congregationLevel: false,
    arrange: (owner) =>
      shared.rules.add(owner.denominationId, {
        ...input,
        effectiveFrom: `2020-01-${String(shared.rules.rules.length + 1).padStart(2, '0')}`,
      }).id,
    act: (scope, id) =>
      shared.service.update(contextFor(scope), id, {
        ...input,
        effectiveFrom: shared.rules.rules.find((r) => r.id === id)!
          .effectiveFrom,
        nationalShareRate: 0.3,
      }),
  });

  describeCrossTenantIsolation('deleting a tithe rule', {
    congregationLevel: false,
    arrange: (owner) =>
      shared.rules.add(owner.denominationId, {
        ...input,
        effectiveFrom: `2021-02-${String(shared.rules.rules.length + 1).padStart(2, '0')}`,
      }).id,
    act: (scope, id) => shared.service.remove(contextFor(scope), id),
  });
});
