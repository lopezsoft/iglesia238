import { describe, expect, it } from 'vitest';
import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import { TENANT_A, TENANT_A_WIDE } from '../../../../test/support/tenants.js';
import {
  PERSON,
  TODAY,
  TYPE,
  actingIn,
  buildKit,
} from '../testing/world-fixtures.js';
import { RecordContributionUseCase } from './record-contribution.use-case.js';
import { VoidContributionUseCase } from './void-contribution.use-case.js';

const REASON = 'Valor digitado con error; se registra de nuevo.';

function setup() {
  const kit = buildKit();
  const record = new RecordContributionUseCase(
    kit.contributions,
    kit.transactions,
    kit.numbering,
    kit.audit,
    kit.clock,
  );
  const voidUseCase = new VoidContributionUseCase(
    kit.contributions,
    kit.transactions,
    kit.audit,
  );
  const treasurer = actingIn(TENANT_A);
  const recordOne = async (overrides: Record<string, unknown> = {}) =>
    record.execute(treasurer, {
      contributionTypeId: TYPE.tithe,
      personId: PERSON.ana,
      receivedOn: TODAY,
      amount: 250_000,
      paymentMethod: 'CASH',
      paymentReference: null,
      vowPledgeId: null,
      notes: null,
      ...overrides,
    });
  return { kit, record, voidUseCase, treasurer, recordOne };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  return (error as { code?: string } | null)?.code ?? 'NO_ERROR';
}

describe('VoidContributionUseCase', () => {
  it('voids the contribution and its receipt, keeping the row', async () => {
    const { kit, voidUseCase, treasurer, recordOne } = setup();
    const row = await recordOne();

    const voided = await voidUseCase.execute(treasurer, row.id, REASON);

    expect(voided).toMatchObject({
      id: row.id,
      status: 'VOIDED',
      voidReason: REASON,
    });
    expect(kit.world.contributions).toHaveLength(1);
    expect(kit.world.vouchers[0].voidedReason).toBe(REASON);
  });

  it('audits the void with the receipt and no personal data', async () => {
    const { kit, voidUseCase, treasurer, recordOne } = setup();
    const row = await recordOne();

    await voidUseCase.execute(treasurer, row.id, REASON, '10.0.0.9');

    const entry = kit.audit.entries.at(-1)!;
    expect(entry).toMatchObject({
      action: 'CONTRIBUTION_VOIDED',
      ipAddress: '10.0.0.9',
    });
    expect(entry.changes).toMatchObject({
      status: { from: 'RECORDED', to: 'VOIDED' },
      receipt: { from: 'REC-2026-00001', to: 'REC-2026-00001' },
    });
    expect(JSON.stringify(entry.changes)).not.toMatch(/Ana|Pérez/);
  });

  it('requires a reason of at least ten characters', async () => {
    const { voidUseCase, treasurer, recordOne } = setup();
    const row = await recordOne();

    expect(await codeOf(voidUseCase.execute(treasurer, row.id, 'corto'))).toBe(
      'VOID_REASON_REQUIRED',
    );
    expect(
      await codeOf(voidUseCase.execute(treasurer, row.id, '          ')),
    ).toBe('VOID_REASON_REQUIRED');
  });

  it('refuses a second void', async () => {
    const { voidUseCase, treasurer, recordOne } = setup();
    const row = await recordOne();
    await voidUseCase.execute(treasurer, row.id, REASON);

    expect(await codeOf(voidUseCase.execute(treasurer, row.id, REASON))).toBe(
      'ALREADY_VOIDED',
    );
  });

  it('refuses a settled contribution and one consolidated in the cash book', async () => {
    const { kit, voidUseCase, treasurer, recordOne } = setup();
    const settled = await recordOne();
    const consolidated = await recordOne({ amount: 10_000 });
    kit.world.contributions.find((c) => c.id === settled.id)!.settled = true;
    kit.world.contributions.find(
      (c) => c.id === consolidated.id,
    )!.consolidated = true;

    expect(
      await codeOf(voidUseCase.execute(treasurer, settled.id, REASON)),
    ).toBe('CONTRIBUTION_SETTLED');
    expect(
      await codeOf(voidUseCase.execute(treasurer, consolidated.id, REASON)),
    ).toBe('CONTRIBUTION_CONSOLIDATED');
    expect(kit.world.contributions.every((c) => c.status === 'RECORDED')).toBe(
      true,
    );
  });

  it('reports a conflict when the contribution changed while the void was processed', async () => {
    const { kit, voidUseCase, treasurer, recordOne } = setup();
    const row = await recordOne();
    // The cash book consolidates it between the read and the update.
    const original = kit.contributions.markVoided.bind(kit.contributions);
    kit.contributions.markVoided = (...args) => {
      kit.world.contributions[0].consolidated = true;
      return original(...args);
    };

    expect(await codeOf(voidUseCase.execute(treasurer, row.id, REASON))).toBe(
      'CONTRIBUTION_CHANGED',
    );
    expect(kit.world.vouchers[0].voidedReason).toBeNull();
  });

  it('requires a sede', async () => {
    const { voidUseCase, recordOne } = setup();
    const row = await recordOne();

    expect(
      await codeOf(
        voidUseCase.execute(actingIn(TENANT_A_WIDE), row.id, REASON),
      ),
    ).toBe('CONGREGATION_SCOPE_REQUIRED');
  });

  describe('vow payments', () => {
    function pledge(kit: ReturnType<typeof setup>['kit']) {
      kit.world.pledges.push({
        id: 7,
        denominationId: 1,
        congregationId: 10,
        personId: PERSON.ana,
        contributionTypeId: TYPE.vow,
        description: null,
        pledgedAmount: 500_000,
        pledgedOn: '2026-03-01',
        dueOn: null,
        status: 'ACTIVE',
      });
    }

    it('reopens a fulfilled pledge when its last payment is voided', async () => {
      const { kit, voidUseCase, treasurer, recordOne } = setup();
      pledge(kit);
      const payment = await recordOne({
        contributionTypeId: TYPE.vow,
        vowPledgeId: 7,
        amount: 500_000,
      });
      expect(kit.world.pledges[0].status).toBe('FULFILLED');

      await voidUseCase.execute(treasurer, payment.id, REASON);

      expect(kit.world.pledges[0].status).toBe('ACTIVE');
      expect(kit.world.paidOf(7)).toBe(0);
    });

    it('keeps a cancelled pledge cancelled', async () => {
      const { kit, voidUseCase, treasurer, recordOne } = setup();
      pledge(kit);
      const payment = await recordOne({
        contributionTypeId: TYPE.vow,
        vowPledgeId: 7,
        amount: 100_000,
      });
      kit.world.pledges[0].status = 'CANCELLED';

      await voidUseCase.execute(treasurer, payment.id, REASON);

      expect(kit.world.pledges[0].status).toBe('CANCELLED');
    });
  });

  describeCrossTenantIsolation('VoidContributionUseCase', {
    arrange: async () => {
      const { kit, recordOne } = setup();
      const row = await recordOne();
      return { id: row.id, kit };
    },
    act: async (scope, { id, kit }) =>
      new VoidContributionUseCase(
        kit.contributions,
        kit.transactions,
        kit.audit,
      ).execute(actingIn(scope), id, REASON),
  });
});
