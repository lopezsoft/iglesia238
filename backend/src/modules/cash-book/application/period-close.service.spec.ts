import { contextFor } from '../../../../test/support/accounting-doubles.js';
import {
  buildCashBookWorld,
  codeOf,
  type CashBookWorld,
} from '../../../../test/support/cash-book-world.js';
import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import { TENANT_A, TENANT_A_WIDE } from '../../../../test/support/tenants.js';

describe('PeriodCloseService', () => {
  it('does not close the month in progress', async () => {
    const world = buildCashBookWorld();

    expect(
      await codeOf(world.closing.close(world.treasurer, world.ids.november)),
    ).toBe('PERIOD_NOT_ENDED');
  });

  it('closes the periods in order, once the month ended and nothing is pending', async () => {
    const world = buildCashBookWorld();
    world.book.periods.find((p) => p.id === world.ids.october)!.status = 'OPEN';

    // November cannot close while October is open.
    expect(
      await codeOf(world.closing.close(world.treasurer, world.ids.november)),
    ).toBe('PREVIOUS_PERIOD_OPEN');

    world.book.addContribution(TENANT_A, {
      accountId: world.ids.tithes,
      receivedOn: '2026-10-20',
    });
    expect(
      await codeOf(world.closing.close(world.treasurer, world.ids.october)),
    ).toBe('PENDING_CONSOLIDATION');

    await world.consolidation.consolidate(world.treasurer, '2026-10-20');
    const closed = await world.closing.close(
      world.treasurer,
      world.ids.october,
    );

    expect(closed).toMatchObject({ status: 'CLOSED', label: 'Octubre 2026' });
    expect(closed.closedAt).not.toBeNull();
    expect(world.audit.last).toMatchObject({
      action: 'PERIOD_CLOSED',
      entity: 'AccountingPeriod',
    });
    expect(
      await codeOf(world.closing.close(world.treasurer, world.ids.october)),
    ).toBe('PERIOD_ALREADY_CLOSED');
  });

  it('rejects movements in the period it closed', async () => {
    const world = buildCashBookWorld();
    world.book.periods.find((p) => p.id === world.ids.october)!.status = 'OPEN';
    await world.closing.close(world.treasurer, world.ids.october);

    expect(
      await codeOf(
        world.movements.record(world.treasurer, {
          fundId: world.ids.local,
          direction: 'OUT',
          accountId: world.ids.expense,
          postedOn: '2026-10-20',
          amount: 1_000,
          description: 'Pago tardío',
        }),
      ),
    ).toBe('PERIOD_CLOSED');
  });

  it('opens the next month when it does not exist', async () => {
    const world = buildCashBookWorld('2026-12-05');

    await world.closing.close(world.treasurer, world.ids.november);

    const december = world.book.periods.find(
      (p) => p.year === 2026 && p.month === 12,
    );
    expect(december?.status).toBe('OPEN');
  });

  it('carries the balance of each fund into the next year when December closes', async () => {
    const world = buildCashBookWorld('2027-01-05');
    world.book.periods.length = 0;
    const november = world.book.addPeriod(TENANT_A, 2026, 11, 'CLOSED');
    const december = world.book.addPeriod(TENANT_A, 2026, 12);
    world.book.addLine(TENANT_A, {
      periodId: november.id,
      accountId: world.ids.expense,
      fundId: world.ids.local,
      direction: 'OUT',
      postedOn: '2026-11-10',
      amount: 450_000,
    });
    world.book.addLine(TENANT_A, {
      periodId: december.id,
      accountId: world.ids.tithes,
      fundId: world.ids.missions,
      direction: 'IN',
      postedOn: '2026-12-20',
      amount: 80_000.5,
    });

    await world.closing.close(world.treasurer, december.id);

    const carried = world.book.openings.filter((o) => o.year === 2027);
    expect(
      Object.fromEntries(carried.map((o) => [o.fundId, o.amount])),
    ).toEqual({
      [world.ids.local]: 18_000_000,
      [world.ids.missions]: 80_000.5,
    });
    expect(
      world.book.periods.some((p) => p.year === 2027 && p.month === 1),
    ).toBe(true);
    expect(world.audit.last?.changes?.carriedBalances).toEqual({
      from: null,
      to: 2,
    });
  });

  it('does not overwrite an opening balance that already exists for the new year', async () => {
    const world = buildCashBookWorld('2027-01-05');
    world.book.periods.length = 0;
    const december = world.book.addPeriod(TENANT_A, 2026, 12);
    world.book.setOpening(TENANT_A, world.ids.local, 2027, 5);

    await world.closing.close(world.treasurer, december.id);

    expect(
      world.book.openings.filter(
        (o) => o.year === 2027 && o.fundId === world.ids.local,
      ),
    ).toEqual([expect.objectContaining({ amount: 5 })]);
  });

  it('needs a sede', async () => {
    const world = buildCashBookWorld();
    const wide = contextFor(TENANT_A_WIDE, ['cash-transactions.write']);

    expect(await codeOf(world.closing.close(wide, world.ids.november))).toBe(
      'CONGREGATION_SCOPE_REQUIRED',
    );
  });

  describeCrossTenantIsolation('closing a period', {
    arrange: (owner) => {
      const world = shared();
      return world.book.addPeriod(owner, 2026, 1 + world.book.periods.length)
        .id;
    },
    act: (scope, id) =>
      shared().closing.close(
        contextFor(scope, ['cash-transactions.write']),
        id,
      ),
  });
});

let sharedWorld: CashBookWorld | undefined;
function shared(): CashBookWorld {
  sharedWorld ??= buildCashBookWorld('2027-06-15');
  return sharedWorld;
}
