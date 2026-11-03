import {
  Clock,
  SystemClock,
  bogotaDateOf,
  bogotaMonthOf,
  bogotaYearOf,
} from './bogota-time.js';

describe('Bogota time', () => {
  it('is five hours behind UTC', () => {
    // 04:59 UTC is still the previous day in Bogota (23:59).
    expect(bogotaDateOf(new Date('2026-11-02T04:59:00Z'))).toBe('2026-11-01');
    expect(bogotaDateOf(new Date('2026-11-02T05:00:00Z'))).toBe('2026-11-02');
  });

  it('does not move at the end of the UTC day', () => {
    // 23:30 in Bogota is already the next day in UTC.
    expect(bogotaDateOf(new Date('2026-11-03T04:30:00Z'))).toBe('2026-11-02');
  });

  it('crosses the new year by Bogota time, not by UTC', () => {
    expect(bogotaDateOf(new Date('2027-01-01T03:00:00Z'))).toBe('2026-12-31');
    expect(bogotaYearOf(new Date('2027-01-01T03:00:00Z'))).toBe(2026);
    expect(bogotaMonthOf(new Date('2027-01-01T03:00:00Z'))).toBe(12);
  });

  it('gives a Clock a testable "today"', () => {
    class FixedClock extends Clock {
      now(): Date {
        return new Date('2026-06-15T02:00:00Z');
      }
    }

    expect(new FixedClock().today()).toBe('2026-06-14');
  });

  it('has a system clock that returns the current instant', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(new SystemClock().today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
