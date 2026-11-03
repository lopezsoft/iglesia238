import { describe, expect, it } from 'vitest';
import {
  assertPledgePayable,
  assertVowShape,
  formatPesos,
} from './vow-payment-rules.js';
import {
  displayStatusOf,
  maskDocument,
  memberCodeOf,
  shortPersonName,
  summarizeByCategory,
  voidBlockOf,
} from './contribution-rules.js';

describe('displayStatusOf and voidBlockOf', () => {
  it('shows a recorded contribution inside a settlement as settled', () => {
    expect(displayStatusOf({ status: 'RECORDED', settled: false })).toBe(
      'RECORDED',
    );
    expect(displayStatusOf({ status: 'RECORDED', settled: true })).toBe(
      'SETTLED',
    );
    expect(displayStatusOf({ status: 'VOIDED', settled: true })).toBe('VOIDED');
  });

  it('blocks the void of settled and consolidated contributions, settlement first', () => {
    expect(
      voidBlockOf({ status: 'RECORDED', settled: false, consolidated: false }),
    ).toBeNull();
    expect(
      voidBlockOf({ status: 'RECORDED', settled: false, consolidated: true }),
    ).toBe('CONSOLIDATED');
    expect(
      voidBlockOf({ status: 'RECORDED', settled: true, consolidated: true }),
    ).toBe('SETTLED');
    expect(
      voidBlockOf({ status: 'VOIDED', settled: true, consolidated: true }),
    ).toBeNull();
  });
});

describe('shortPersonName, maskDocument and memberCodeOf', () => {
  it('uses name and first surname, falling back to the full name', () => {
    expect(
      shortPersonName({
        firstName: 'Ana',
        lastName: 'Pérez',
        fullName: 'Ana María Pérez Gómez',
      }),
    ).toBe('Ana Pérez');
    expect(
      shortPersonName({
        firstName: null,
        lastName: null,
        fullName: ' Abuela Rosa ',
      }),
    ).toBe('Abuela Rosa');
    expect(
      shortPersonName({ firstName: null, lastName: null, fullName: null }),
    ).toBeNull();
  });

  it('keeps only the type and the last four digits of the document', () => {
    expect(maskDocument('CC', '52.341.904')).toBe('CC ···1904');
    expect(maskDocument('CC', '123')).toBe('CC ···123');
    expect(maskDocument('CC', null)).toBe('—');
    expect(maskDocument('CC', '52341904')).not.toContain('5234');
  });

  it('composes the member code with the code of the sede', () => {
    expect(memberCodeOf({ memberNumber: 130, congregationCode: 'SC' })).toBe(
      'SC-0130',
    );
    expect(memberCodeOf(null)).toBeNull();
  });
});

describe('summarizeByCategory', () => {
  it('always lists the four main categories and OTHER only when used', () => {
    const { summary, totalAmount } = summarizeByCategory([]);

    expect(summary.map((s) => s.category)).toEqual([
      'TITHE',
      'OFFERING',
      'FIRST_FRUITS',
      'VOW',
    ]);
    expect(totalAmount).toBe(0);
    expect(summary.every((s) => s.share === 0)).toBe(true);
  });

  it('adds in cents and computes whole percentages', () => {
    const { summary, totalAmount } = summarizeByCategory([
      { category: 'TITHE', amount: 0.1, count: 1 },
      { category: 'TITHE', amount: 0.2, count: 1 },
      { category: 'OTHER', amount: 0.1, count: 1 },
    ]);

    expect(totalAmount).toBe(0.4);
    expect(summary.find((s) => s.category === 'TITHE')).toMatchObject({
      amount: 0.3,
      count: 2,
      share: 75,
    });
    expect(summary.find((s) => s.category === 'OTHER')).toMatchObject({
      share: 25,
    });
  });
});

describe('assertVowShape', () => {
  it('accepts a vow with person and pledge, and a non-vow without pledge', () => {
    expect(() =>
      assertVowShape({ category: 'VOW', personId: 1, vowPledgeId: 2 }),
    ).not.toThrow();
    expect(() =>
      assertVowShape({ category: 'TITHE', personId: null, vowPledgeId: null }),
    ).not.toThrow();
  });

  it.each([
    [
      { category: 'VOW' as const, personId: null, vowPledgeId: 2 },
      'VOW_REQUIRES_PERSON',
    ],
    [
      { category: 'VOW' as const, personId: 1, vowPledgeId: null },
      'VOW_PLEDGE_REQUIRED',
    ],
    [
      { category: 'OFFERING' as const, personId: 1, vowPledgeId: 2 },
      'VOW_PLEDGE_NOT_ALLOWED',
    ],
  ])('rejects %j', (input, code) => {
    expect(() => assertVowShape(input)).toThrow(
      expect.objectContaining({ code }),
    );
  });
});

function errorOf(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('assertPledgePayable', () => {
  const pledge = {
    personId: 1,
    contributionTypeId: 3,
    pledgedAmount: 1_000_000,
    status: 'ACTIVE',
    paid: 550_000,
  };
  const payment = { personId: 1, contributionTypeId: 3, amount: 450_000 };

  it('accepts a payment that exactly covers the balance', () => {
    expect(() => assertPledgePayable(pledge, payment)).not.toThrow();
  });

  it('rejects a payment one peso above the balance, naming the balance', () => {
    const error = errorOf(() =>
      assertPledgePayable(pledge, { ...payment, amount: 450_001 }),
    );

    expect(error).toMatchObject({ code: 'VOW_PAYMENT_EXCEEDS_BALANCE' });
    expect((error as Error).message).toContain('450.000');
  });

  it('rejects a pledge of another person or type, or a missing one', () => {
    for (const bad of [
      { ...payment, personId: 2 },
      { ...payment, contributionTypeId: 4 },
    ]) {
      expect(() => assertPledgePayable(pledge, bad)).toThrow(
        expect.objectContaining({ code: 'VOW_PLEDGE_MISMATCH' }),
      );
    }
    expect(() => assertPledgePayable(null, payment)).toThrow(
      expect.objectContaining({ code: 'VOW_PLEDGE_MISMATCH' }),
    );
  });

  it('rejects cancelled and fulfilled pledges', () => {
    expect(() =>
      assertPledgePayable({ ...pledge, status: 'CANCELLED' }, payment),
    ).toThrow(expect.objectContaining({ code: 'VOW_PLEDGE_CLOSED' }));
    expect(() =>
      assertPledgePayable(
        { ...pledge, paid: 1_000_000 },
        { ...payment, amount: 1 },
      ),
    ).toThrow(expect.objectContaining({ code: 'VOW_PLEDGE_CLOSED' }));
  });
});

describe('formatPesos', () => {
  it('writes Colombian pesos without decimals', () => {
    expect(formatPesos(1_250_000).replace(/\s/g, ' ')).toBe('$ 1.250.000');
  });
});
