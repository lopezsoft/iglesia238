import { describe, expect, it } from 'vitest';
import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import {
  TENANT_A,
  TENANT_A_SIBLING,
  TENANT_A_WIDE,
  TENANT_B,
} from '../../../../test/support/tenants.js';
import { RecordContributionUseCase } from '../../contributions/application/record-contribution.use-case.js';
import { VoidContributionUseCase } from '../../contributions/application/void-contribution.use-case.js';
import {
  PERSON,
  TODAY,
  TYPE,
  actingIn,
  buildKit,
} from '../../contributions/testing/world-fixtures.js';
import { CancelVowPledgeUseCase } from './cancel-vow-pledge.use-case.js';
import {
  type CreateVowPledgeCommand,
  CreateVowPledgeUseCase,
} from './create-vow-pledge.use-case.js';
import { ExportVowPledgesUseCase } from './export-vow-pledges.use-case.js';
import { GetVowPledgeUseCase } from './get-vow-pledge.use-case.js';
import { ListVowPledgesUseCase } from './list-vow-pledges.use-case.js';
import { UpdateVowPledgeUseCase } from './update-vow-pledge.use-case.js';
import {
  GetVowPaymentTargetUseCase,
  ListOpenVowPledgesUseCase,
} from './vow-payment-targets.use-cases.js';

function setup() {
  const kit = buildKit();
  const vows = kit.vows;
  const create = new CreateVowPledgeUseCase(
    vows,
    kit.transactions,
    kit.audit,
    kit.clock,
  );
  const update = new UpdateVowPledgeUseCase(
    vows,
    kit.transactions,
    kit.audit,
    kit.clock,
  );
  const cancel = new CancelVowPledgeUseCase(
    vows,
    kit.transactions,
    kit.audit,
    kit.clock,
  );
  const list = new ListVowPledgesUseCase(vows, kit.clock);
  const get = new GetVowPledgeUseCase(vows, kit.clock);
  const open = new ListOpenVowPledgesUseCase(vows);
  const target = new GetVowPaymentTargetUseCase(vows);
  const exporter = new ExportVowPledgesUseCase(vows, kit.audit, kit.clock);
  const record = new RecordContributionUseCase(
    kit.contributions,
    kit.transactions,
    kit.numbering,
    kit.audit,
    kit.clock,
  );
  const voider = new VoidContributionUseCase(
    kit.contributions,
    kit.transactions,
    kit.audit,
  );
  const treasurer = actingIn(TENANT_A);

  const pledge = (
    overrides: Partial<CreateVowPledgeCommand> = {},
    actor = treasurer,
  ) =>
    create.execute(actor, {
      personId: PERSON.ana,
      contributionTypeId: TYPE.vow,
      pledgedAmount: 1_000_000,
      pledgedOn: '2026-03-01',
      dueOn: null,
      description: 'Ampliación del templo',
      ...overrides,
    });
  const pay = (pledgeId: number, amount: number, actor = treasurer) =>
    record.execute(actor, {
      contributionTypeId: TYPE.vow,
      personId: PERSON.ana,
      receivedOn: TODAY,
      amount,
      paymentMethod: 'CASH',
      paymentReference: null,
      vowPledgeId: pledgeId,
      notes: null,
    });
  return {
    kit,
    create,
    update,
    cancel,
    list,
    get,
    open,
    target,
    exporter,
    voider,
    treasurer,
    pledge,
    pay,
  };
}

const PAGE = { page: 1, pageSize: 10 };

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  return (error as { code?: string } | null)?.code ?? 'NO_ERROR';
}

describe('CreateVowPledgeUseCase', () => {
  it('creates an active pledge with code, balance and no payments', async () => {
    const { pledge } = setup();

    const row = await pledge();

    expect(row).toMatchObject({
      code: `VOTO-2026-${String(row.id).padStart(4, '0')}`,
      personName: 'Ana Pérez',
      memberCode: 'SC-0130',
      status: 'ACTIVE',
      pledgedAmount: 1_000_000,
      paid: 0,
      balance: 1_000_000,
      progress: 0,
      paymentCount: 0,
      congregationName: 'Sede Central',
      isOverdue: false,
    });
  });

  it('audits the creation without personal data', async () => {
    const { kit, pledge } = setup();

    await pledge({ dueOn: '2027-06-30', ipAddress: '10.0.0.3' });

    const entry = kit.audit.entries.at(-1)!;
    expect(entry).toMatchObject({
      action: 'VOW_PLEDGE_CREATED',
      entity: 'VowPledge',
      ipAddress: '10.0.0.3',
    });
    expect(entry.changes).toMatchObject({
      status: { from: null, to: 'ACTIVE' },
      pledgedAmount: { from: null, to: 1_000_000 },
      dueOn: { from: null, to: '2027-06-30' },
    });
    expect(JSON.stringify(entry.changes)).not.toMatch(/Ana|templo/);
  });

  it.each([
    ['a zero amount', { pledgedAmount: 0 }, 'INVALID_AMOUNT'],
    ['a future date', { pledgedOn: '2026-12-01' }, 'FUTURE_DATE'],
    ['an impossible date', { pledgedOn: '2026-13-01' }, 'INVALID_DATE'],
    ['a due date before the promise', { dueOn: '2026-02-01' }, 'INVALID_DATE'],
    ['a long description', { description: 'x'.repeat(256) }, 'NOTES_TOO_LONG'],
    [
      'a type that is not a vow',
      { contributionTypeId: TYPE.tithe },
      'VOW_TYPE_INVALID',
    ],
    ['an unknown type', { contributionTypeId: 999 }, 'VOW_TYPE_INVALID'],
    ['a person that does not exist', { personId: 999 }, 'PERSON_NOT_FOUND'],
  ])('rejects %s', async (_label, overrides, expected) => {
    const { pledge } = setup();

    expect(await codeOf(pledge(overrides))).toBe(expected);
  });

  it('requires a sede', async () => {
    const { pledge } = setup();

    expect(await codeOf(pledge({}, actingIn(TENANT_A_WIDE)))).toBe(
      'CONGREGATION_SCOPE_REQUIRED',
    );
  });

  it('does not accept a person or a type of another denomination', async () => {
    const { pledge } = setup();

    expect(await codeOf(pledge({ personId: PERSON.otherDenomination }))).toBe(
      'PERSON_NOT_FOUND',
    );
    expect(
      await codeOf(pledge({ contributionTypeId: TYPE.otherDenominationTithe })),
    ).toBe('VOW_TYPE_INVALID');
  });
});

describe('ListVowPledgesUseCase', () => {
  it('computes paid, balance, progress and status from the valid payments', async () => {
    const { list, treasurer, pledge, pay, voider } = setup();
    const row = await pledge();
    const second = await pledge({
      description: 'Sonido',
      pledgedAmount: 200_000,
    });
    await pay(row.id, 300_000);
    const mistake = await pay(row.id, 250_000);
    await voider.execute(
      treasurer,
      mistake.id,
      'Abono registrado en la promesa equivocada',
    );
    await pay(second.id, 200_000);

    const overview = await list.execute(treasurer, PAGE);

    const first = overview.items.find((i) => i.id === row.id)!;
    expect(first).toMatchObject({
      paid: 300_000,
      balance: 700_000,
      progress: 30,
      status: 'ACTIVE',
      paymentCount: 1,
      lastPaymentOn: TODAY,
    });
    expect(overview.items.find((i) => i.id === second.id)).toMatchObject({
      status: 'FULFILLED',
      balance: 0,
      progress: 100,
    });
  });

  it('gives the KPIs of the scope and the counts per status', async () => {
    const { list, treasurer, pledge, pay, cancel } = setup();
    const a = await pledge({ pledgedAmount: 1_000_000 });
    await pledge({ pledgedAmount: 500_000, pledgedOn: '2026-01-10' });
    const cancelled = await pledge({ pledgedAmount: 9_000_000 });
    await pay(a.id, 400_000);
    await cancel.execute(
      treasurer,
      cancelled.id,
      'El miembro no puede cumplir.',
    );

    const { kpis, statusCounts } = await list.execute(treasurer, PAGE);

    expect(kpis).toEqual({
      pledgedTotal: 1_500_000,
      paidTotal: 400_000,
      balanceTotal: 1_100_000,
      pledgeCount: 2,
      withBalanceCount: 2,
      activeCount: 2,
      // The second pledge has no payment and is older than ninety days.
      staleCount: 1,
      overdueCount: 0,
    });
    expect(statusCounts).toEqual({
      ALL: 3,
      ACTIVE: 2,
      FULFILLED: 0,
      CANCELLED: 1,
    });
  });

  it('filters by status, type, overdue and search, and paginates', async () => {
    const { list, treasurer, pledge, pay } = setup();
    const paid = await pledge({ pledgedAmount: 100_000 });
    await pay(paid.id, 100_000);
    await pledge({
      personId: PERSON.luis,
      pledgedAmount: 300_000,
      dueOn: '2026-10-01',
    });
    await pledge({ pledgedAmount: 200_000, pledgedOn: '2026-05-01' });

    const ids = async (query: object) =>
      (await list.execute(treasurer, { ...PAGE, ...query })).items.map(
        (i) => i.pledgedAmount,
      );

    expect(await ids({ status: 'FULFILLED' })).toEqual([100_000]);
    expect(await ids({ overdueOnly: true })).toEqual([300_000]);
    expect(await ids({ search: 'gómez' })).toEqual([300_000]);
    expect(await ids({ contributionTypeId: TYPE.vow })).toHaveLength(3);
    const second = await list.execute(treasurer, { page: 2, pageSize: 2 });
    expect(second).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(second.items).toHaveLength(1);
  });

  it('finds a pledge by its code', async () => {
    const { list, treasurer, pledge } = setup();
    const row = await pledge();
    await pledge({ personId: PERSON.luis });

    const found = await list.execute(treasurer, { ...PAGE, search: row.code });

    expect(found.items.map((i) => i.id)).toEqual([row.id]);
  });

  it('lists the vow types, and labels a denomination-wide view as read-only', async () => {
    const { list, pledge } = setup();
    await pledge();
    await pledge({ personId: PERSON.luis }, actingIn(TENANT_A_SIBLING));

    const wide = await list.execute(actingIn(TENANT_A_WIDE), PAGE);
    const sede = await list.execute(actingIn(TENANT_A), PAGE);

    expect(wide).toMatchObject({
      congregationScoped: false,
      scopeLabel: 'todas las sedes',
      total: 2,
    });
    expect(wide.vowTypes).toEqual([{ id: TYPE.vow, name: 'Voto' }]);
    expect(sede).toMatchObject({
      congregationScoped: true,
      scopeLabel: 'Sede Central',
      total: 1,
    });
  });

  it('never lists the pledges of another denomination', async () => {
    const { list, pledge } = setup();
    await pledge();

    const other = await list.execute(actingIn(TENANT_B), PAGE);

    expect(other).toMatchObject({ total: 0, items: [] });
    expect(other.kpis.pledgeCount).toBe(0);
    expect(other.vowTypes).toEqual([]);
  });
});

describe('GetVowPledgeUseCase', () => {
  it('shows the payments newest first with their receipts, voided ones included', async () => {
    const { get, treasurer, pledge, pay, voider } = setup();
    const row = await pledge();
    const first = await pay(row.id, 100_000);
    await pay(row.id, 50_000);
    await voider.execute(
      treasurer,
      first.id,
      'Abono registrado en la promesa equivocada',
    );

    const detail = await get.execute(treasurer, row.id);

    expect(detail).toMatchObject({
      documentHint: 'CC ···1904',
      fundName: 'Fondo de Construcción',
      paid: 50_000,
      paymentCount: 1,
    });
    expect(detail.payments.map((p) => [p.receiptNumber, p.status])).toEqual([
      ['REC-2026-00002', 'RECORDED'],
      ['REC-2026-00001', 'VOIDED'],
    ]);
  });

  it('lists the payments of every sede of the denomination, even for a pledge of another sede', async () => {
    const { get, pledge, pay } = setup();
    const row = await pledge();
    // Ana moved to Norte and pays there a pledge made in Central.
    await pay(row.id, 70_000, actingIn(TENANT_A_SIBLING));

    const detail = await get.execute(actingIn(TENANT_A), row.id);

    expect(detail.payments.map((p) => p.congregationName)).toEqual([
      'Sede Norte',
    ]);
  });

  describeCrossTenantIsolation('GetVowPledgeUseCase', {
    arrange: async () => {
      const ctx = setup();
      const row = await ctx.pledge();
      return { id: row.id, get: ctx.get };
    },
    act: (scope, { id, get }) => get.execute(actingIn(scope), id),
  });
});

describe('UpdateVowPledgeUseCase', () => {
  it('changes the amount, the due date and the observations, and audits the figures', async () => {
    const { kit, update, treasurer, pledge } = setup();
    const row = await pledge();

    const updated = await update.execute(treasurer, row.id, {
      pledgedAmount: 1_500_000,
      dueOn: '2027-01-31',
      description: 'Ampliación fase 2',
    });

    expect(updated).toMatchObject({
      pledgedAmount: 1_500_000,
      dueOn: '2027-01-31',
      description: 'Ampliación fase 2',
    });
    const entry = kit.audit.entries.at(-1)!;
    expect(entry.action).toBe('VOW_PLEDGE_UPDATED');
    expect(entry.changes).toMatchObject({
      pledgedAmount: { from: 1_000_000, to: 1_500_000 },
      dueOn: { from: null, to: '2027-01-31' },
    });
    expect(JSON.stringify(entry.changes)).not.toContain('fase 2');
  });

  it('clears the due date and the observations with null, and leaves the fields that are not sent', async () => {
    const { update, treasurer, pledge } = setup();
    const row = await pledge({ dueOn: '2027-01-31' });

    const cleared = await update.execute(treasurer, row.id, {
      dueOn: null,
      description: null,
    });

    expect(cleared).toMatchObject({
      dueOn: null,
      description: null,
      pledgedAmount: 1_000_000,
    });
  });

  it('does not let the amount fall below what has been paid', async () => {
    const { update, treasurer, pledge, pay } = setup();
    const row = await pledge();
    await pay(row.id, 600_000);

    expect(
      await codeOf(
        update.execute(treasurer, row.id, { pledgedAmount: 599_999 }),
      ),
    ).toBe('VOW_AMOUNT_BELOW_PAID');
    const exact = await update.execute(treasurer, row.id, {
      pledgedAmount: 600_000,
    });
    expect(exact.status).toBe('FULFILLED');
  });

  it('reopens a fulfilled pledge when the amount goes up', async () => {
    const { update, treasurer, pledge, pay } = setup();
    const row = await pledge({ pledgedAmount: 100_000 });
    await pay(row.id, 100_000);

    const updated = await update.execute(treasurer, row.id, {
      pledgedAmount: 150_000,
    });

    expect(updated).toMatchObject({ status: 'ACTIVE', balance: 50_000 });
  });

  it('refuses a cancelled pledge, an empty change and a due date before the promise', async () => {
    const { update, cancel, treasurer, pledge } = setup();
    const row = await pledge();

    expect(await codeOf(update.execute(treasurer, row.id, {}))).toBe(
      'VALIDATION_ERROR',
    );
    expect(
      await codeOf(update.execute(treasurer, row.id, { dueOn: '2026-01-01' })),
    ).toBe('INVALID_DATE');
    await cancel.execute(treasurer, row.id, 'Ya no podrá cumplir la promesa.');
    expect(
      await codeOf(update.execute(treasurer, row.id, { pledgedAmount: 5 })),
    ).toBe('VOW_PLEDGE_CANCELLED');
  });

  describeCrossTenantIsolation('UpdateVowPledgeUseCase', {
    arrange: async () => {
      const ctx = setup();
      const row = await ctx.pledge();
      return { id: row.id, update: ctx.update };
    },
    act: (scope, { id, update }) =>
      update.execute(actingIn(scope), id, { description: 'Nueva descripción' }),
  });
});

describe('CancelVowPledgeUseCase', () => {
  it('cancels an active pledge and keeps its payments', async () => {
    const { kit, cancel, treasurer, pledge, pay } = setup();
    const row = await pledge();
    await pay(row.id, 100_000);

    const cancelled = await cancel.execute(
      treasurer,
      row.id,
      'El miembro cambió de ciudad.',
      '10.0.0.4',
    );

    expect(cancelled).toMatchObject({ status: 'CANCELLED', paid: 100_000 });
    expect(kit.world.contributions).toHaveLength(1);
    const entry = kit.audit.entries.at(-1)!;
    expect(entry).toMatchObject({
      action: 'VOW_PLEDGE_CANCELLED',
      ipAddress: '10.0.0.4',
    });
    expect(entry.changes).toMatchObject({
      status: { from: 'ACTIVE', to: 'CANCELLED' },
    });
  });

  it('requires a reason and refuses a pledge that is already cancelled or fulfilled', async () => {
    const { cancel, treasurer, pledge, pay } = setup();
    const row = await pledge({ pledgedAmount: 100_000 });
    const other = await pledge({ pledgedAmount: 100_000 });
    await pay(other.id, 100_000);

    expect(await codeOf(cancel.execute(treasurer, row.id, 'corto'))).toBe(
      'VOID_REASON_REQUIRED',
    );
    await cancel.execute(treasurer, row.id, 'No podrá cumplir la promesa.');
    expect(
      await codeOf(
        cancel.execute(treasurer, row.id, 'No podrá cumplir la promesa.'),
      ),
    ).toBe('VOW_PLEDGE_CANCELLED');
    expect(
      await codeOf(
        cancel.execute(
          treasurer,
          other.id,
          'Intento de cancelar una cumplida.',
        ),
      ),
    ).toBe('VOW_PLEDGE_FULFILLED');
  });

  describeCrossTenantIsolation('CancelVowPledgeUseCase', {
    arrange: async () => {
      const ctx = setup();
      const row = await ctx.pledge();
      return { id: row.id, cancel: ctx.cancel };
    },
    act: (scope, { id, cancel }) =>
      cancel.execute(actingIn(scope), id, 'Motivo de la cancelación.'),
  });
});

describe('payment targets', () => {
  it('offers the open pledges of the person and type, of every sede of the denomination', async () => {
    const { open, treasurer, pledge, pay } = setup();
    const central = await pledge({ description: 'Templo' });
    const north = await pledge(
      { description: 'Sonido', pledgedAmount: 200_000 },
      actingIn(TENANT_A_SIBLING),
    );
    const closed = await pledge({ pledgedAmount: 50_000 });
    await pay(closed.id, 50_000);
    await pledge({ personId: PERSON.luis });

    const options = await open.execute(treasurer, PERSON.ana, TYPE.vow);

    expect(options.map((o) => o.id)).toEqual([central.id, north.id]);
    expect(options[0]).toMatchObject({ balance: 1_000_000 });
    expect(options[0].label.replace(/\s/g, ' ')).toBe(
      `${central.code} · Templo · saldo $ 1.000.000`,
    );
  });

  it('does not offer pledges of another denomination', async () => {
    const { open, pledge } = setup();
    await pledge();

    expect(
      await open.execute(actingIn(TENANT_B), PERSON.ana, TYPE.vow),
    ).toEqual([]);
  });

  it('resolves the target of "Registrar abono" with a masked person, and refuses a closed pledge', async () => {
    const { target, treasurer, pledge, pay, cancel } = setup();
    const row = await pledge();
    const other = await pledge();

    const found = await target.execute(treasurer, row.id);

    expect(found.person).toEqual({
      id: PERSON.ana,
      fullName: 'Ana Pérez',
      memberCode: 'SC-0130',
      congregationName: 'Sede Central',
      documentHint: 'CC ···1904',
    });
    expect(found.pledge).toMatchObject({ id: row.id, balance: 1_000_000 });
    await pay(row.id, 1_000_000);
    expect(await codeOf(target.execute(treasurer, row.id))).toBe(
      'VOW_PLEDGE_CLOSED',
    );
    await cancel.execute(treasurer, other.id, 'No podrá cumplir la promesa.');
    expect(await codeOf(target.execute(treasurer, other.id))).toBe(
      'VOW_PLEDGE_CLOSED',
    );
  });

  describeCrossTenantIsolation('GetVowPaymentTargetUseCase', {
    arrange: async () => {
      const ctx = setup();
      const row = await ctx.pledge();
      return { id: row.id, target: ctx.target };
    },
    act: (scope, { id, target }) => target.execute(actingIn(scope), id),
    // The target is looked up across the denomination: only another denomination must not see it.
    congregationLevel: false,
  });
});

describe('ExportVowPledgesUseCase', () => {
  it('writes the pledges as CSV and audits only the count', async () => {
    const { exporter, treasurer, pledge, pay, kit } = setup();
    const row = await pledge();
    await pay(row.id, 250_000);

    const file = await exporter.execute(treasurer, {}, '10.0.0.7');

    expect(file.filename).toBe('votos-2026-11-02.csv');
    const line = file.content.split('\r\n')[1];
    expect(line).toContain(
      `${row.code};Ana Pérez;SC-0130;Sede Central;Voto;01/03/2026;;1000000;250000;750000;25;Activa;02/11/2026;1;Ampliación del templo`,
    );
    expect(kit.audit.entries.at(-1)).toMatchObject({
      action: 'VOW_PLEDGES_EXPORTED',
      ipAddress: '10.0.0.7',
    });
  });

  it('exports nothing from another denomination', async () => {
    const { exporter, pledge } = setup();
    await pledge();

    expect((await exporter.execute(actingIn(TENANT_B), {})).rows).toBe(0);
  });
});
