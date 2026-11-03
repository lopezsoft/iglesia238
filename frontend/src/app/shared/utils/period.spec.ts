import { displayDate, monthLabel, monthRange, nextMonth, previousMonth, yearMonthOf } from './period';

describe('period helpers', () => {
  it('reads the year and month of a date', () => {
    expect(yearMonthOf('2026-11-02')).toEqual({ year: 2026, month: 11 });
  });

  it('gives the first and last day of a month, leap years included', () => {
    expect(monthRange({ year: 2026, month: 11 })).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange({ year: 2028, month: 2 }).to).toBe('2028-02-29');
  });

  it('writes the label of a month in Spanish', () => {
    expect(monthLabel({ year: 2026, month: 3 })).toBe('Marzo 2026');
  });

  it('moves across the year boundary', () => {
    expect(nextMonth({ year: 2026, month: 12 })).toEqual({ year: 2027, month: 1 });
    expect(previousMonth({ year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 });
  });

  it('formats a date for display', () => {
    expect(displayDate('2026-11-02')).toBe('02/11/2026');
  });
});
