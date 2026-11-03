import {
  FakeAuditRecorder,
  FakeTransactionRunner,
  FixedClock,
  contextFor,
} from '../../../../test/support/accounting-doubles.js';
import { InMemoryFundRepository } from '../../../../test/support/accounting-setup-fakes.js';
import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import {
  TENANT_A,
  TENANT_A_WIDE,
  TENANT_B,
  buildTenantContext,
} from '../../../../test/support/tenants.js';
import { FundsService } from './funds.service.js';

const sharedFunds = new InMemoryFundRepository();
const sharedService = new FundsService(
  sharedFunds,
  new FakeTransactionRunner(),
  new FakeAuditRecorder(),
  FixedClock.at('2026-11-02'),
);

function setup() {
  const funds = new InMemoryFundRepository();
  const audit = new FakeAuditRecorder();
  const transactions = new FakeTransactionRunner();
  const service = new FundsService(
    funds,
    transactions,
    audit,
    FixedClock.at('2026-11-02'),
  );
  const treasurer = contextFor(TENANT_A);
  return { funds, audit, service, treasurer };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as { code?: string } | null;
  return error?.code ?? 'NO_ERROR';
}

describe('FundsService', () => {
  it('lists only the funds of the denomination, active ones first', async () => {
    const { funds, service, treasurer } = setup();
    funds.add(1, 'Fondo Local', false);
    funds.add(1, 'Misiones');
    funds.add(2, 'Fondo General');
    funds.setFacts(2, { hasMovements: true });

    const rows = await service.list(treasurer);

    expect(rows.map((f) => f.name)).toEqual(['Misiones', 'Fondo Local']);
    expect(rows.every((f) => f.denominationId === 1)).toBe(true);
    expect(rows[0].inUse).toBe(true);
  });

  it('shows the opening balance of the sede and locks it once the fund has movements in the year', async () => {
    const { funds, service, treasurer } = setup();
    const local = funds.add(1, 'Fondo Local');
    funds.openings.set(`10:${local.id}:2026`, 18_450_000);
    funds.setFacts(local.id, { hasMovementsInYear: true });

    const [row] = await service.list(treasurer);

    expect(row).toMatchObject({
      openingBalance: 18_450_000,
      openingLocked: true,
    });
  });

  it('always locks the opening balance for a denomination-wide session', async () => {
    const { funds, service } = setup();
    funds.add(1, 'Fondo Local');

    const [row] = await service.list(contextFor(TENANT_A_WIDE));

    expect(row.openingLocked).toBe(true);
  });

  it('creates a fund with its opening balance and audits it without personal data', async () => {
    const { funds, audit, service, treasurer } = setup();

    const row = await service.create(treasurer, {
      name: '  Comité de Caballeros ',
      isActive: true,
      openingBalance: 350_000,
    });

    expect(row).toMatchObject({
      name: 'Comité de Caballeros',
      openingBalance: 350_000,
      openingLocked: false,
    });
    expect(funds.openingOf(10, row.id, 2026)).toBe(350_000);
    expect(audit.last).toMatchObject({
      action: 'FUND_CREATED',
      entity: 'Fund',
      entityId: row.id,
    });
    expect(audit.last?.changes?.openingBalance).toEqual({
      from: null,
      to: 350_000,
    });
  });

  it('rejects a name that repeats another one ignoring case and accents', async () => {
    const { funds, service, treasurer } = setup();
    funds.add(1, 'Fondo Misión');
    funds.add(2, 'Fondo Nuevo');

    expect(
      await codeOf(
        service.create(treasurer, {
          name: 'fondo mision',
          isActive: true,
          openingBalance: null,
        }),
      ),
    ).toBe('FUND_NAME_TAKEN');
    // The same name in another denomination is fine.
    await expect(
      service.create(treasurer, {
        name: 'Fondo Nuevo',
        isActive: true,
        openingBalance: null,
      }),
    ).resolves.toMatchObject({ name: 'Fondo Nuevo' });
  });

  it('validates the name length and the opening balance', async () => {
    const { service, treasurer } = setup();
    const base = { name: 'Dorcas', isActive: true, openingBalance: null };

    expect(
      await codeOf(service.create(treasurer, { ...base, name: 'ab' })),
    ).toBe('INVALID_NAME');
    expect(
      await codeOf(service.create(treasurer, { ...base, openingBalance: -1 })),
    ).toBe('INVALID_AMOUNT');
  });

  it('needs a sede to set an opening balance', async () => {
    const { service } = setup();

    expect(
      await codeOf(
        service.create(contextFor(TENANT_A_WIDE), {
          name: 'Dorcas',
          isActive: true,
          openingBalance: 100,
        }),
      ),
    ).toBe('CONGREGATION_SCOPE_REQUIRED');
  });

  it('refuses a platform scope', async () => {
    const { service } = setup();

    expect(
      await codeOf(service.list(buildTenantContext({ kind: 'PLATFORM' }))),
    ).toBe('PLATFORM_SCOPE_NOT_ALLOWED');
  });

  it('locks the opening balance when the fund has movements this year', async () => {
    const { funds, service, treasurer } = setup();
    const local = funds.add(1, 'Fondo Local');
    funds.openings.set(`10:${local.id}:2026`, 100);
    funds.setFacts(local.id, { hasMovementsInYear: true });
    const input = { name: 'Fondo Local', isActive: true };

    expect(
      await codeOf(
        service.update(treasurer, local.id, { ...input, openingBalance: 1 }),
      ),
    ).toBe('OPENING_BALANCE_LOCKED');
    // Sending the same amount is not a change.
    await expect(
      service.update(treasurer, local.id, { ...input, openingBalance: 100 }),
    ).resolves.toMatchObject({ openingBalance: 100 });
  });

  it('refuses to deactivate the suggested fund of active accounts', async () => {
    const { funds, service, treasurer } = setup();
    const local = funds.add(1, 'Fondo Local');
    funds.setFacts(local.id, {
      suggestingAccounts: 2,
      suggestingActiveAccounts: 2,
    });

    expect(
      await codeOf(
        service.update(treasurer, local.id, {
          name: 'Fondo Local',
          isActive: false,
          openingBalance: null,
        }),
      ),
    ).toBe('FUND_IS_DEFAULT');
    expect(funds.funds[0].isActive).toBe(true);
  });

  it('deletes a fund that nothing uses and refuses one that is in use', async () => {
    const { funds, audit, service, treasurer } = setup();
    const used = funds.add(1, 'Fondo Local');
    const free = funds.add(1, 'Temporal');
    funds.setFacts(used.id, { hasMovements: true });

    expect(await codeOf(service.remove(treasurer, used.id))).toBe(
      'FUND_IN_USE',
    );
    await service.remove(treasurer, free.id);

    expect(funds.funds.map((f) => f.id)).toEqual([used.id]);
    expect(audit.last?.action).toBe('FUND_DELETED');
  });

  describeCrossTenantIsolation('updating a fund', {
    congregationLevel: false,
    arrange: (owner) => {
      return sharedFunds.add(
        owner.denominationId,
        `Fondo ${sharedFunds.funds.length}`,
      ).id;
    },
    act: (scope, id) =>
      sharedService.update(contextFor(scope), id, {
        name: 'Nombre nuevo',
        isActive: true,
        openingBalance: null,
      }),
  });

  describeCrossTenantIsolation('deleting a fund', {
    congregationLevel: false,
    arrange: (owner) =>
      sharedFunds.add(owner.denominationId, `Fondo ${sharedFunds.funds.length}`)
        .id,
    act: (scope, id) => sharedService.remove(contextFor(scope), id),
  });

  it('keeps the other denomination untouched when it tries to reach a fund', async () => {
    const { funds, service } = setup();
    const fund = funds.add(1, 'Fondo Local');

    await expect(
      service.remove(contextFor(TENANT_B), fund.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(funds.funds).toHaveLength(1);
  });
});
