import { describe, expect, it } from 'vitest';
import {
  STALE_DAYS,
  daysBetween,
  isStalePledge,
  pledgeIdFromCode,
  vowBalance,
  vowPledgeCode,
  vowPledgeStatusFor,
  vowProgress,
} from './vow-pledge-rules.js';

describe('vowPledgeCode and pledgeIdFromCode', () => {
  it('writes the year of the promise and a four-digit id, and reads it back', () => {
    expect(vowPledgeCode({ id: 14, pledgedOn: '2026-03-05' })).toBe(
      'VOTO-2026-0014',
    );
    expect(pledgeIdFromCode('voto-2026-0014')).toBe(14);
    expect(pledgeIdFromCode(' VOTO-2026-14 ')).toBe(14);
    expect(pledgeIdFromCode('Ana')).toBeNull();
  });
});

describe('vowBalance and vowProgress', () => {
  it('never goes below zero or above one hundred', () => {
    expect(vowBalance(1_000_000, 550_000)).toBe(450_000);
    expect(vowBalance(100, 150)).toBe(0);
    expect(vowProgress(1_000_000, 550_000)).toBe(55);
    expect(vowProgress(100, 150)).toBe(100);
    expect(vowProgress(0, 0)).toBe(0);
  });

  it('is exact with cents', () => {
    expect(vowBalance(0.3, 0.1)).toBe(0.2);
  });
});

describe('vowPledgeStatusFor', () => {
  it('fulfils the pledge when the payments reach the promise and reopens it when they do not', () => {
    expect(vowPledgeStatusFor('ACTIVE', 1000, 1000)).toBe('FULFILLED');
    expect(vowPledgeStatusFor('FULFILLED', 1000, 999.99)).toBe('ACTIVE');
  });

  it('keeps a cancelled pledge cancelled whatever was paid', () => {
    expect(vowPledgeStatusFor('CANCELLED', 1000, 1000)).toBe('CANCELLED');
    expect(vowPledgeStatusFor('CANCELLED', 1000, 0)).toBe('CANCELLED');
  });
});

describe('isStalePledge', () => {
  it('counts from the last payment, or from the promise when there is none', () => {
    expect(daysBetween('2026-08-04', '2026-11-02')).toBe(90);
    expect(
      isStalePledge(
        { pledgedOn: '2026-08-03', lastPaymentOn: null },
        '2026-11-02',
      ),
    ).toBe(true);
    expect(
      isStalePledge(
        { pledgedOn: '2026-08-04', lastPaymentOn: null },
        '2026-11-02',
      ),
    ).toBe(false);
    expect(
      isStalePledge(
        { pledgedOn: '2025-01-01', lastPaymentOn: '2026-10-25' },
        '2026-11-02',
      ),
    ).toBe(false);
    expect(STALE_DAYS).toBe(90);
  });
});
