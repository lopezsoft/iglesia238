import {
  compareYearMonth,
  displayDate,
  fromCents,
  monthLabel,
  monthRange,
  nextMonth,
  previousMonth,
  roundMoney,
  sameText,
  signedCents,
  toCents,
  yearMonthOf,
} from './accounting-rules.js';

describe('accounting rules', () => {
  it('reads year and month of an ISO date', () => {
    expect(yearMonthOf('2026-11-02')).toEqual({ year: 2026, month: 11 });
  });

  it('gives the first and last day of a month, leap years included', () => {
    expect(monthRange({ year: 2026, month: 11 })).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(monthRange({ year: 2028, month: 2 }).to).toBe('2028-02-29');
    expect(monthRange({ year: 2027, month: 2 }).to).toBe('2027-02-28');
  });

  it('writes the label of a month in Spanish', () => {
    expect(monthLabel({ year: 2026, month: 11 })).toBe('Noviembre 2026');
  });

  it('moves between months across the year boundary', () => {
    expect(nextMonth({ year: 2026, month: 12 })).toEqual({
      year: 2027,
      month: 1,
    });
    expect(previousMonth({ year: 2026, month: 1 })).toEqual({
      year: 2025,
      month: 12,
    });
    expect(
      compareYearMonth({ year: 2026, month: 3 }, { year: 2025, month: 12 }),
    ).toBeGreaterThan(0);
  });

  it('computes money in cents without float drift', () => {
    expect(toCents(0.1) + toCents(0.2)).toBe(30);
    expect(fromCents(toCents(1234.56))).toBe(1234.56);
    expect(roundMoney(10.005 * 100)).toBe(1000.5);
    expect(signedCents('IN', 500)).toBe(500);
    expect(signedCents('OUT', 500)).toBe(-500);
  });

  it('compares names ignoring case and accents', () => {
    expect(sameText('Fondo Misión', ' fondo mision ')).toBe(true);
    expect(sameText('Fondo Local', 'Fondo General')).toBe(false);
  });

  it('formats a date for stored descriptions', () => {
    expect(displayDate('2026-11-02')).toBe('02/11/2026');
  });
});
