import type { PeriodRecord } from '../../../common/accounting/period-view.js';
import type { CashLineRecord, VoucherRef } from './cash-book.repository.js';
import {
  closeBlockOf,
  computeBookTotals,
  groupPending,
  openRangeOf,
  reversalBlockOf,
  targetFundOf,
  voucherCodeOf,
} from './cash-book-rules.js';

const period = (
  year: number,
  month: number,
  status: 'OPEN' | 'CLOSED' = 'OPEN',
): PeriodRecord => ({
  id: year * 100 + month,
  year,
  month,
  status,
  closedAt: null,
});

const ref = (type: string, number = 1): VoucherRef => ({
  type,
  number,
  issuedOn: '2026-11-02',
});

function line(overrides: Partial<CashLineRecord> = {}): CashLineRecord {
  return {
    id: 1,
    postedOn: '2026-11-02',
    accountId: 1,
    accountCode: '510505',
    accountName: 'Servicios',
    fundId: 1,
    description: 'x',
    direction: 'OUT',
    amount: 10,
    voucher: ref('CE'),
    reversalOfId: null,
    reversalOfVoucher: null,
    reversedBy: null,
    consolidatedDates: [],
    ...overrides,
  };
}

describe('cash book rules', () => {
  it('formats the code of a voucher, or a dash without one', () => {
    expect(voucherCodeOf(ref('CE', 45))).toBe('CE-2026-00045');
    expect(voucherCodeOf(null)).toBe('—');
  });

  it('accumulates the balance in cents without float drift', () => {
    const totals = computeBookTotals(1_000, [
      { id: 1, direction: 'IN', amount: 0.1 },
      { id: 2, direction: 'IN', amount: 0.2 },
      { id: 3, direction: 'OUT', amount: 0.3 },
    ]);

    expect(totals.closingCents).toBe(1_000);
    expect(totals.balanceAfter.get(2)).toBe(1_030);
    expect(totals).toMatchObject({
      inCount: 2,
      outCount: 1,
      incomeCents: 30,
      expenseCents: 30,
    });
  });

  describe('reversalBlockOf', () => {
    const periods = [period(2026, 10, 'CLOSED'), period(2026, 11)];

    it('lets a regular line be reversed', () => {
      expect(reversalBlockOf(line(), periods)).toBeNull();
    });

    it('blocks reversals, reversed lines, receipts and settlements', () => {
      expect(reversalBlockOf(line({ reversalOfId: 9 }), periods)).toBe(
        'IS_REVERSAL',
      );
      expect(
        reversalBlockOf(
          line({ reversedBy: { id: 2, voucher: null } }),
          periods,
        ),
      ).toBe('ALREADY_REVERSED');
      expect(reversalBlockOf(line({ voucher: ref('REC') }), periods)).toBe(
        'CONTRIBUTION',
      );
      expect(reversalBlockOf(line({ voucher: ref('LD') }), periods)).toBe(
        'TITHE_SETTLEMENT',
      );
    });

    it('blocks the consolidation of contributions that are no longer in an open period', () => {
      const consolidation = line({ voucher: ref('CI'), direction: 'IN' });

      expect(
        reversalBlockOf(
          { ...consolidation, consolidatedDates: ['2026-11-02'] },
          periods,
        ),
      ).toBeNull();
      expect(
        reversalBlockOf(
          { ...consolidation, consolidatedDates: ['2026-10-20'] },
          periods,
        ),
      ).toBe('CONSOLIDATION_PERIOD_CLOSED');
      expect(
        reversalBlockOf(
          { ...consolidation, consolidatedDates: ['2026-09-20'] },
          periods,
        ),
      ).toBe('CONSOLIDATION_PERIOD_CLOSED');
    });
  });

  describe('closeBlockOf', () => {
    const base = { today: '2026-12-05', pendingContributions: 0 };

    it('closes an ended month in order', () => {
      const periods = [period(2026, 10, 'CLOSED'), period(2026, 11)];
      expect(closeBlockOf({ ...base, period: periods[1], periods })).toBeNull();
    });

    it('reports the first reason that applies', () => {
      const october = period(2026, 10);
      const november = period(2026, 11);
      const periods = [october, november];

      expect(
        closeBlockOf({ ...base, period: period(2026, 9, 'CLOSED'), periods })
          ?.code,
      ).toBe('PERIOD_ALREADY_CLOSED');
      expect(closeBlockOf({ ...base, period: november, periods })?.code).toBe(
        'PREVIOUS_PERIOD_OPEN',
      );
      expect(
        closeBlockOf({ ...base, today: '2026-10-31', period: october, periods })
          ?.code,
      ).toBe('PERIOD_NOT_ENDED');
      expect(
        closeBlockOf({
          ...base,
          period: october,
          periods,
          pendingContributions: 3,
        })?.message,
      ).toContain('3 aportes pendientes');
    });
  });

  it('gives the range of dates open for posting, never after today', () => {
    expect(
      openRangeOf([period(2026, 10, 'CLOSED'), period(2026, 11)], '2026-11-02'),
    ).toEqual({
      min: '2026-11-01',
      max: '2026-11-02',
    });
    expect(
      openRangeOf([period(2026, 9), period(2026, 10)], '2026-11-02'),
    ).toEqual({
      min: '2026-09-01',
      max: '2026-10-31',
    });
    expect(openRangeOf([period(2026, 10, 'CLOSED')], '2026-11-02')).toBeNull();
    expect(openRangeOf([period(2026, 12)], '2026-11-02')).toBeNull();
  });

  it('chooses the suggested fund, or the oldest active one', () => {
    const funds = [
      { id: 5, name: 'Dorcas', isActive: true },
      { id: 2, name: 'Local', isActive: true },
      { id: 1, name: 'Viejo', isActive: false },
    ];

    expect(targetFundOf(5, funds)).toBe(5);
    expect(targetFundOf(null, funds)).toBe(2);
    expect(targetFundOf(null, [])).toBeNull();
  });

  it('groups pending contributions by account and fund', () => {
    const groups = groupPending(
      [
        {
          id: 1,
          amount: 10.1,
          receivedOn: 'd',
          accountId: 1,
          defaultFundId: null,
        },
        {
          id: 2,
          amount: 0.2,
          receivedOn: 'd',
          accountId: 1,
          defaultFundId: null,
        },
        { id: 3, amount: 5, receivedOn: 'd', accountId: 2, defaultFundId: 9 },
      ],
      (c) => c.defaultFundId ?? 1,
    );

    expect(groups).toEqual([
      {
        accountId: 1,
        fundId: 1,
        count: 2,
        amountCents: 1030,
        contributionIds: [1, 2],
      },
      {
        accountId: 2,
        fundId: 9,
        count: 1,
        amountCents: 500,
        contributionIds: [3],
      },
    ]);
  });
});
