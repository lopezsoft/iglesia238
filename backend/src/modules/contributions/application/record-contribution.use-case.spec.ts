import { describe, expect, it } from 'vitest';
import {
  BusinessRuleException,
  ErrorCode,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  TENANT_A,
  TENANT_A_SIBLING,
  TENANT_A_WIDE,
  TENANT_B,
} from '../../../../test/support/tenants.js';
import {
  PERSON,
  TODAY,
  TYPE,
  actingIn,
  buildKit,
} from '../testing/world-fixtures.js';
import {
  type RecordContributionCommand,
  RecordContributionUseCase,
} from './record-contribution.use-case.js';

function setup() {
  const kit = buildKit();
  const useCase = new RecordContributionUseCase(
    kit.contributions,
    kit.transactions,
    kit.numbering,
    kit.audit,
    kit.clock,
  );
  return { kit, useCase };
}

function command(
  overrides: Partial<RecordContributionCommand> = {},
): RecordContributionCommand {
  return {
    contributionTypeId: TYPE.tithe,
    personId: PERSON.ana,
    receivedOn: TODAY,
    amount: 250_000,
    paymentMethod: 'CASH',
    paymentReference: null,
    vowPledgeId: null,
    notes: null,
    ...overrides,
  };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(Error);
  return (error as { code?: string }).code ?? 'NO_CODE';
}

const treasurer = actingIn(TENANT_A);

describe('RecordContributionUseCase', () => {
  it('records the contribution with a REC receipt that follows the sequence of the sede', async () => {
    const { kit, useCase } = setup();

    const first = await useCase.execute(treasurer, command());
    const second = await useCase.execute(
      treasurer,
      command({ amount: 100_000 }),
    );

    expect(first).toMatchObject({
      receiptNumber: 'REC-2026-00001',
      status: 'RECORDED',
      amount: 250_000,
      contributorName: 'Ana Pérez',
      memberCode: 'SC-0130',
      congregationName: 'Sede Central',
      voidBlock: null,
    });
    expect(second.receiptNumber).toBe('REC-2026-00002');
    // The contribution is born without a cash movement: the cash book consolidates it later.
    expect(kit.world.contributions.every((c) => !c.consolidated)).toBe(true);
  });

  it('numbers each sede on its own', async () => {
    const { useCase } = setup();

    await useCase.execute(treasurer, command());
    const north = await useCase.execute(
      actingIn(TENANT_A_SIBLING),
      command({ personId: PERSON.luis }),
    );

    expect(north.receiptNumber).toBe('REC-2026-00001');
  });

  it('audits the record without names or free text', async () => {
    const { kit, useCase } = setup();

    await useCase.execute(
      treasurer,
      command({ notes: 'Colecta del culto', ipAddress: '10.0.0.5' }),
    );

    const entry = kit.audit.entries.at(-1)!;
    expect(entry).toMatchObject({
      action: 'CONTRIBUTION_RECORDED',
      entity: 'Contribution',
      congregationId: 10,
      ipAddress: '10.0.0.5',
    });
    expect(entry.changes).toMatchObject({
      status: { from: null, to: 'RECORDED' },
      amount: { from: null, to: 250_000 },
      category: { from: null, to: 'TITHE' },
      receipt: { from: null, to: 'REC-2026-00001' },
    });
    expect(JSON.stringify(entry.changes)).not.toMatch(/Ana|Pérez|Colecta/);
  });

  it('accepts anonymous contributions and collections with a description', async () => {
    const { useCase } = setup();

    const anonymous = await useCase.execute(
      treasurer,
      command({ personId: null }),
    );
    const collection = await useCase.execute(
      treasurer,
      command({ personId: null, notes: 'Culto dominical 10:00 a. m.' }),
    );

    expect(anonymous).toMatchObject({ contributorName: null, notes: null });
    expect(collection).toMatchObject({
      contributorName: null,
      notes: 'Culto dominical 10:00 a. m.',
    });
  });

  it('requires a sede: a denomination-wide session cannot record', async () => {
    const { useCase } = setup();

    const code = await codeOf(
      useCase.execute(actingIn(TENANT_A_WIDE), command()),
    );

    expect(code).toBe(ErrorCode.CONGREGATION_SCOPE_REQUIRED);
  });

  describe('validation', () => {
    it.each([
      ['an amount of zero', { amount: 0 }, 'INVALID_AMOUNT'],
      ['a negative amount', { amount: -5 }, 'INVALID_AMOUNT'],
      [
        'an amount above the column limit',
        { amount: 1_000_000_000_000 },
        'INVALID_AMOUNT',
      ],
      ['a malformed date', { receivedOn: '2026-02-30' }, 'INVALID_DATE'],
      ['a future date', { receivedOn: '2026-11-03' }, 'FUTURE_DATE'],
      [
        'a transfer without reference',
        { paymentMethod: 'BANK_TRANSFER' as const },
        'REFERENCE_REQUIRED',
      ],
      [
        'a reference over 80 characters',
        { paymentMethod: 'CASH' as const, paymentReference: 'x'.repeat(81) },
        'REFERENCE_TOO_LONG',
      ],
      [
        'notes over 255 characters',
        { notes: 'x'.repeat(256) },
        'NOTES_TOO_LONG',
      ],
    ])('rejects %s', async (_label, overrides, expected) => {
      const { useCase } = setup();

      expect(await codeOf(useCase.execute(treasurer, command(overrides)))).toBe(
        expected,
      );
    });

    it('accepts a card payment with its approval number', async () => {
      const { useCase } = setup();

      const row = await useCase.execute(
        treasurer,
        command({ paymentMethod: 'CARD', paymentReference: 'TRX 884120' }),
      );

      expect(row.paymentReference).toBe('TRX 884120');
    });
  });

  describe('periods and types', () => {
    it('rejects a date in a closed period', async () => {
      const { useCase } = setup();

      expect(
        await codeOf(
          useCase.execute(treasurer, command({ receivedOn: '2026-10-25' })),
        ),
      ).toBe('PERIOD_CLOSED');
    });

    it('rejects a month without an accounting period', async () => {
      const { useCase } = setup();

      const error = await useCase
        .execute(treasurer, command({ receivedOn: '2026-09-15' }))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BusinessRuleException);
      expect((error as BusinessRuleException).code).toBe('PERIOD_NOT_FOUND');
    });

    it('rejects inactive types and types whose account cannot receive movements', async () => {
      const { useCase } = setup();

      expect(
        await codeOf(
          useCase.execute(
            treasurer,
            command({ contributionTypeId: TYPE.inactive }),
          ),
        ),
      ).toBe('TYPE_INACTIVE');
      expect(
        await codeOf(
          useCase.execute(
            treasurer,
            command({ contributionTypeId: TYPE.brokenAccount }),
          ),
        ),
      ).toBe('ACCOUNT_NOT_POSTABLE');
    });

    it('refuses tithes dated inside an issued settlement, but not other categories', async () => {
      const { kit, useCase } = setup();
      kit.world.settlements.push({
        denominationId: 1,
        congregationId: 10,
        from: '2026-11-01',
        to: '2026-11-02',
      });

      expect(await codeOf(useCase.execute(treasurer, command()))).toBe(
        'TITHE_RANGE_SETTLED',
      );
      const offering = await useCase.execute(
        treasurer,
        command({ contributionTypeId: TYPE.offering }),
      );
      expect(offering.status).toBe('RECORDED');
    });
  });

  describe('vow payments', () => {
    function withPledge(kit: ReturnType<typeof buildKit>, overrides = {}) {
      kit.world.pledges.push({
        id: 7,
        denominationId: 1,
        congregationId: 10,
        personId: PERSON.ana,
        contributionTypeId: TYPE.vow,
        description: 'Ampliación del templo',
        pledgedAmount: 1_000_000,
        pledgedOn: '2026-03-01',
        dueOn: null,
        status: 'ACTIVE',
        ...overrides,
      });
    }
    const payment = (overrides: Partial<RecordContributionCommand> = {}) =>
      command({
        contributionTypeId: TYPE.vow,
        vowPledgeId: 7,
        amount: 400_000,
        ...overrides,
      });

    it('applies the payment to the pledge and fulfils it when the balance reaches zero', async () => {
      const { kit, useCase } = setup();
      withPledge(kit);

      const first = await useCase.execute(treasurer, payment());
      expect(first).toMatchObject({
        vowPledgeId: 7,
        vowPledgeCode: 'VOTO-2026-0007',
      });
      expect(kit.world.pledges[0].status).toBe('ACTIVE');

      await useCase.execute(treasurer, payment({ amount: 600_000 }));
      expect(kit.world.pledges[0].status).toBe('FULFILLED');
    });

    it('rejects a payment above the balance and one to a fulfilled or cancelled pledge', async () => {
      const { kit, useCase } = setup();
      withPledge(kit);

      expect(
        await codeOf(
          useCase.execute(treasurer, payment({ amount: 1_000_001 })),
        ),
      ).toBe('VOW_PAYMENT_EXCEEDS_BALANCE');

      kit.world.pledges[0].status = 'CANCELLED';
      expect(await codeOf(useCase.execute(treasurer, payment()))).toBe(
        'VOW_PLEDGE_CLOSED',
      );
    });

    it('accepts only a pledge of the same person and the same type', async () => {
      const { kit, useCase } = setup();
      withPledge(kit);

      expect(
        await codeOf(
          useCase.execute(treasurer, payment({ personId: PERSON.luis })),
        ),
      ).toBe('VOW_PLEDGE_MISMATCH');
      expect(
        await codeOf(useCase.execute(treasurer, payment({ vowPledgeId: 999 }))),
      ).toBe('VOW_PLEDGE_MISMATCH');
    });

    it('needs a named contributor and a pledge, and refuses a pledge on other categories', async () => {
      const { kit, useCase } = setup();
      withPledge(kit);

      expect(
        await codeOf(useCase.execute(treasurer, payment({ personId: null }))),
      ).toBe('VOW_REQUIRES_PERSON');
      expect(
        await codeOf(
          useCase.execute(treasurer, payment({ vowPledgeId: null })),
        ),
      ).toBe('VOW_PLEDGE_REQUIRED');
      expect(
        await codeOf(useCase.execute(treasurer, command({ vowPledgeId: 7 }))),
      ).toBe('VOW_PLEDGE_NOT_ALLOWED');
    });

    it('accepts a payment to a pledge made in another sede of the same denomination', async () => {
      const { kit, useCase } = setup();
      withPledge(kit, { congregationId: 11 });

      const row = await useCase.execute(treasurer, payment());

      expect(row.congregationName).toBe('Sede Central');
      expect(kit.world.paidOf(7)).toBe(400_000);
    });

    it('rolls everything back when the audit trail cannot be written', async () => {
      const { kit, useCase } = setup();
      withPledge(kit);
      kit.audit.failWith = new Error('audit down');

      await expect(useCase.execute(treasurer, payment())).rejects.toThrow(
        'audit down',
      );

      expect(kit.world.contributions).toHaveLength(0);
      expect(kit.world.vouchers).toHaveLength(0);
      expect(kit.world.sequences.counters.size).toBe(0);
    });
  });

  describe('tenant isolation', () => {
    it('does not see a person of another denomination', async () => {
      const { useCase } = setup();

      const error = await useCase
        .execute(treasurer, command({ personId: PERSON.otherDenomination }))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundDomainException);
      expect((error as NotFoundDomainException).code).toBe('PERSON_NOT_FOUND');
    });

    it('does not see a contribution type of another denomination', async () => {
      const { useCase } = setup();

      expect(
        await codeOf(
          useCase.execute(
            treasurer,
            command({ contributionTypeId: TYPE.otherDenominationTithe }),
          ),
        ),
      ).toBe('TYPE_INACTIVE');
    });

    it('does not pay a pledge of another denomination', async () => {
      const { kit, useCase } = setup();
      kit.world.pledges.push({
        id: 8,
        denominationId: 2,
        congregationId: 20,
        personId: PERSON.otherDenomination,
        contributionTypeId: TYPE.otherDenominationTithe,
        description: null,
        pledgedAmount: 100,
        pledgedOn: '2026-01-01',
        dueOn: null,
        status: 'ACTIVE',
      });

      expect(
        await codeOf(
          useCase.execute(
            treasurer,
            command({
              contributionTypeId: TYPE.vow,
              vowPledgeId: 8,
              amount: 50,
            }),
          ),
        ),
      ).toBe('VOW_PLEDGE_MISMATCH');
    });

    it('uses the period of the sede, not the one of another denomination', async () => {
      const { useCase } = setup();

      // Denomination B has November open, but its treasurer cannot use Central's types.
      const code = await codeOf(
        useCase.execute(
          actingIn(TENANT_B),
          command({ contributionTypeId: TYPE.tithe }),
        ),
      );

      expect(code).toBe('TYPE_INACTIVE');
    });
  });
});
