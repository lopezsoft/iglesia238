import { contextFor } from '../../../../test/support/accounting-doubles.js';
import {
  buildCashBookWorld,
  codeOf,
  type CashBookWorld,
} from '../../../../test/support/cash-book-world.js';
import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import {
  TENANT_A,
  TENANT_A_SIBLING,
  TENANT_A_WIDE,
} from '../../../../test/support/tenants.js';
import type { RecordMovementInput } from './cash-movements.service.js';

const TODAY = '2026-11-02';

function expense(
  world: CashBookWorld,
  overrides: Partial<RecordMovementInput> = {},
): RecordMovementInput {
  return {
    fundId: world.ids.local,
    direction: 'OUT',
    accountId: world.ids.expense,
    postedOn: TODAY,
    amount: 398_700,
    description: 'Pago servicio de energía de octubre',
    ...overrides,
  };
}

/** A posted line of November that can be reversed. */
function postedLine(world: CashBookWorld, amount = 45_000) {
  return world.book.addLine(TENANT_A, {
    periodId: world.ids.november,
    accountId: world.ids.expense,
    fundId: world.ids.local,
    direction: 'OUT',
    postedOn: '2026-11-01',
    amount,
    description: 'Papelería',
    voucherType: 'CE',
  });
}

describe('CashMovementsService.record', () => {
  it('posts a line with a consecutive CE voucher in the open period and audits it', async () => {
    const world = buildCashBookWorld();

    const first = await world.movements.record(world.treasurer, expense(world));
    const second = await world.movements.record(
      world.treasurer,
      expense(world, { amount: 10_000.5 }),
    );

    expect(first).toMatchObject({
      voucherCode: 'CE-2026-00001',
      direction: 'OUT',
      amount: 398_700,
    });
    expect(second.voucherCode).toBe('CE-2026-00002');
    expect(world.book.lines).toHaveLength(2);
    expect(world.book.lines[0]).toMatchObject({
      periodId: world.ids.november,
      createdById: world.treasurer.userId,
    });
    expect(world.audit.entries[0]).toMatchObject({
      action: 'CASH_TRANSACTION_POSTED',
      entity: 'CashTransaction',
    });
    expect(world.audit.entries[0].changes?.voucher).toEqual({
      from: null,
      to: 'CE-2026-00001',
    });
  });

  it('numbers CI and CE separately, and sedes apart', async () => {
    const world = buildCashBookWorld();
    await world.movements.record(world.treasurer, expense(world));

    const income = await world.movements.record(
      world.treasurer,
      expense(world, { direction: 'IN', accountId: world.ids.tithes }),
    );

    expect(income.voucherCode).toBe('CI-2026-00001');
  });

  it('validates direction, description, amount and the nature of the account', async () => {
    const world = buildCashBookWorld();
    const t = world.treasurer;

    expect(
      await codeOf(
        world.movements.record(t, expense(world, { direction: 'X' as never })),
      ),
    ).toBe('INVALID_DIRECTION');
    expect(
      await codeOf(
        world.movements.record(t, expense(world, { description: ' ' })),
      ),
    ).toBe('DESCRIPTION_REQUIRED');
    expect(
      await codeOf(world.movements.record(t, expense(world, { amount: 0 }))),
    ).toBe('INVALID_AMOUNT');
    expect(
      await codeOf(world.movements.record(t, expense(world, { amount: -5 }))),
    ).toBe('INVALID_AMOUNT');
    expect(
      await codeOf(
        world.movements.record(t, expense(world, { direction: 'IN' })),
      ),
    ).toBe('ACCOUNT_NATURE_MISMATCH');
    expect(
      await codeOf(
        world.movements.record(
          t,
          expense(world, { direction: 'IN', accountId: world.ids.expense }),
        ),
      ),
    ).toBe('ACCOUNT_NATURE_MISMATCH');
  });

  it('refuses a group account, an inactive account and an account of another denomination', async () => {
    const world = buildCashBookWorld();
    const group = world.book.addAccount(1, '5105', { isPostable: false });
    const inactive = world.book.addAccount(1, '510599', { isActive: false });
    const foreign = world.book.addAccount(2, '510505');

    for (const account of [group, inactive, foreign]) {
      expect(
        await codeOf(
          world.movements.record(
            world.treasurer,
            expense(world, { accountId: account.id }),
          ),
        ),
      ).toBe('ACCOUNT_NOT_POSTABLE');
    }
  });

  it('refuses an inactive fund and a fund of another denomination', async () => {
    const world = buildCashBookWorld();
    const camp = world.book.addFund(1, 'Campamento 2025', false);
    const foreign = world.book.addFund(2, 'Fondo General');

    for (const fund of [camp, foreign]) {
      expect(
        await codeOf(
          world.movements.record(
            world.treasurer,
            expense(world, { fundId: fund.id }),
          ),
        ),
      ).toBe('FUND_INACTIVE');
    }
  });

  it('refuses a closed period, a month without period and a future date', async () => {
    const world = buildCashBookWorld();

    expect(
      await codeOf(
        world.movements.record(
          world.treasurer,
          expense(world, { postedOn: '2026-10-20' }),
        ),
      ),
    ).toBe('PERIOD_CLOSED');
    expect(
      await codeOf(
        world.movements.record(
          world.treasurer,
          expense(world, { postedOn: '2026-09-10' }),
        ),
      ),
    ).toBe('PERIOD_NOT_FOUND');
    expect(
      await codeOf(
        world.movements.record(
          world.treasurer,
          expense(world, { postedOn: '2026-11-30' }),
        ),
      ),
    ).toBe('FUTURE_DATE');
    expect(
      await codeOf(
        world.movements.record(
          world.treasurer,
          expense(world, { postedOn: '2026-02-30' }),
        ),
      ),
    ).toBe('INVALID_DATE');
    expect(world.book.lines).toHaveLength(0);
  });

  it('needs a sede', async () => {
    const world = buildCashBookWorld();

    expect(
      await codeOf(
        world.movements.record(
          contextFor(TENANT_A_WIDE, ['cash-transactions.write']),
          expense(world),
        ),
      ),
    ).toBe('CONGREGATION_SCOPE_REQUIRED');
  });

  it('does not use the periods of another sede', async () => {
    const world = buildCashBookWorld();

    // The sibling sede has no periods at all.
    expect(
      await codeOf(
        world.movements.record(
          contextFor(TENANT_A_SIBLING, ['cash-transactions.write']),
          expense(world),
        ),
      ),
    ).toBe('PERIOD_NOT_FOUND');
  });
});

describe('CashMovementsService.reverse', () => {
  it('reverses a line once with the same account, fund and amount and the opposite direction', async () => {
    const world = buildCashBookWorld();
    const original = postedLine(world);

    const receipt = await world.movements.reverse(world.treasurer, {
      transactionId: original.id,
      postedOn: TODAY,
      reason: 'Factura registrada dos veces',
    });

    const reversal = world.book.lines.find(
      (l) => l.id === receipt.transactionId,
    )!;
    expect(reversal).toMatchObject({
      accountId: original.accountId,
      fundId: original.fundId,
      amount: original.amount,
      direction: 'IN',
      reversalOfId: original.id,
    });
    expect(receipt.voucherCode.startsWith('CI-2026-')).toBe(true);
    expect(reversal.description).toContain('Factura registrada dos veces');
    expect(world.audit.last).toMatchObject({
      action: 'CASH_TRANSACTION_REVERSED',
    });

    const reason = 'Segundo intento de reversa';
    expect(
      await codeOf(
        world.movements.reverse(world.treasurer, {
          transactionId: original.id,
          postedOn: TODAY,
          reason,
        }),
      ),
    ).toBe('ALREADY_REVERSED');
    expect(
      await codeOf(
        world.movements.reverse(world.treasurer, {
          transactionId: reversal.id,
          postedOn: TODAY,
          reason,
        }),
      ),
    ).toBe('ALREADY_REVERSED');
  });

  it('validates the reason, the date and the period of the reversal', async () => {
    const world = buildCashBookWorld();
    const original = postedLine(world);
    const base = {
      transactionId: original.id,
      postedOn: TODAY,
      reason: 'Factura registrada dos veces',
    };

    expect(
      await codeOf(
        world.movements.reverse(world.treasurer, { ...base, reason: 'corto' }),
      ),
    ).toBe('REVERSAL_REASON_REQUIRED');
    expect(
      await codeOf(
        world.movements.reverse(world.treasurer, {
          ...base,
          postedOn: '2026-10-30',
        }),
      ),
    ).toBe('PERIOD_CLOSED');
    expect(
      await codeOf(
        world.movements.reverse(world.treasurer, {
          ...base,
          postedOn: '2026-11-30',
        }),
      ),
    ).toBe('FUTURE_DATE');
    expect(world.book.lines).toHaveLength(1);
  });

  it('allows reversing a line of a closed period with a date in an open period', async () => {
    const world = buildCashBookWorld();
    const october = world.book.addLine(TENANT_A, {
      periodId: world.ids.october,
      accountId: world.ids.expense,
      fundId: world.ids.local,
      direction: 'OUT',
      postedOn: '2026-10-15',
      amount: 120_000,
      voucherType: 'CE',
    });

    const receipt = await world.movements.reverse(world.treasurer, {
      transactionId: october.id,
      postedOn: TODAY,
      reason: 'Honorarios pagados por otra cuenta',
    });

    expect(
      world.book.lines.find((l) => l.id === receipt.transactionId)?.periodId,
    ).toBe(world.ids.november);
  });

  it('allows reversing into an inactive fund', async () => {
    const world = buildCashBookWorld();
    const original = postedLine(world);
    world.book.funds.find((f) => f.id === world.ids.local)!.isActive = false;

    await expect(
      world.movements.reverse(world.treasurer, {
        transactionId: original.id,
        postedOn: TODAY,
        reason: 'Fondo cerrado después del pago',
      }),
    ).resolves.toMatchObject({ direction: 'IN' });
  });

  it('sends contribution and tithe settlement lines to their own screens', async () => {
    const world = buildCashBookWorld();
    const receiptLine = world.book.addLine(TENANT_A, {
      periodId: world.ids.november,
      accountId: world.ids.tithes,
      fundId: world.ids.local,
      direction: 'IN',
      postedOn: '2026-11-01',
      amount: 90_000,
      voucherType: 'REC',
    });
    const settlementLine = world.book.addLine(TENANT_A, {
      periodId: world.ids.november,
      accountId: world.ids.expense,
      fundId: world.ids.local,
      direction: 'OUT',
      postedOn: '2026-11-01',
      amount: 500_000,
      voucherType: 'LD',
    });
    const reason = 'Intento de reversa desde la caja';

    expect(
      await codeOf(
        world.movements.reverse(world.treasurer, {
          transactionId: receiptLine.id,
          postedOn: TODAY,
          reason,
        }),
      ),
    ).toBe('CONTRIBUTION_LINE');
    expect(
      await codeOf(
        world.movements.reverse(world.treasurer, {
          transactionId: settlementLine.id,
          postedOn: TODAY,
          reason,
        }),
      ),
    ).toBe('SETTLEMENT_LINE');
  });

  it('releases the contributions of a reversed consolidation so they can be consolidated again', async () => {
    const world = buildCashBookWorld();
    world.book.addContribution(TENANT_A, {
      accountId: world.ids.tithes,
      amount: 90_000,
    });
    world.book.addContribution(TENANT_A, {
      accountId: world.ids.tithes,
      amount: 50_000,
    });
    await world.consolidation.consolidate(world.treasurer, TODAY);
    const line = world.book.lines[0];
    expect(
      world.book.contributions.every((c) => c.cashTransactionId === line.id),
    ).toBe(true);

    await world.movements.reverse(world.treasurer, {
      transactionId: line.id,
      postedOn: TODAY,
      reason: 'Consolidación con un sobre de más',
    });

    expect(
      world.book.contributions.every((c) => c.cashTransactionId === null),
    ).toBe(true);
    expect(world.audit.last?.changes?.releasedContributions).toEqual({
      from: null,
      to: 2,
    });
    expect(
      (await world.consolidation.preview(world.treasurer, TODAY)).count,
    ).toBe(2);
  });

  it('refuses to reverse a consolidation whose contributions belong to a closed period', async () => {
    const world = buildCashBookWorld();
    world.book.periods.find((p) => p.id === world.ids.october)!.status = 'OPEN';
    world.book.addContribution(TENANT_A, {
      accountId: world.ids.tithes,
      receivedOn: '2026-10-20',
    });
    await world.consolidation.consolidate(world.treasurer, '2026-10-20');
    const line = world.book.lines[0];
    world.book.periods.find((p) => p.id === world.ids.october)!.status =
      'CLOSED';

    expect(
      await codeOf(
        world.movements.reverse(world.treasurer, {
          transactionId: line.id,
          postedOn: TODAY,
          reason: 'Consolidación con un sobre de más',
        }),
      ),
    ).toBe('CONSOLIDATION_PERIOD_CLOSED');
    expect(world.book.contributions[0].cashTransactionId).toBe(line.id);
  });

  describeCrossTenantIsolation('reversing a cash line', {
    arrange: (owner) => {
      const world = shared();
      return world.book.addLine(owner, {
        periodId: world.ids.november,
        accountId: world.ids.expense,
        fundId: world.ids.local,
        direction: 'OUT',
        postedOn: '2026-11-01',
        amount: 10_000,
        description: `Línea ${world.book.lines.length}`,
        voucherType: 'CE',
      }).id;
    },
    act: (scope, id) =>
      shared().movements.reverse(
        contextFor(scope, ['cash-transactions.write']),
        {
          transactionId: id,
          postedOn: TODAY,
          reason: 'Intento de reversa de la prueba',
        },
      ),
  });
});

let sharedWorld: CashBookWorld | undefined;
function shared(): CashBookWorld {
  sharedWorld ??= buildCashBookWorld();
  // Other denominations and sedes get their own periods so only the ownership of the line decides.
  return sharedWorld;
}
