import {
  addDays,
  assertReportRange,
  daysBetween,
  monthSpans,
  previousSpan,
} from './report-range.js';

describe('assertReportRange', () => {
  it('accepts a range of one year', () => {
    expect(() =>
      assertReportRange({ from: '2026-01-01', to: '2026-12-31' }),
    ).not.toThrow();
    expect(() =>
      assertReportRange({ from: '2026-10-05', to: '2026-10-05' }),
    ).not.toThrow();
  });

  it('rejects malformed, reversed and multi-year ranges with their code', () => {
    expect(() => assertReportRange({ from: 'x', to: '2026-12-31' })).toThrow(
      expect.objectContaining({ code: 'INVALID_RANGE' }),
    );
    expect(() =>
      assertReportRange({ from: '2026-02-30', to: '2026-03-01' }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_RANGE' }));
    expect(() =>
      assertReportRange({ from: '2026-10-31', to: '2026-10-01' }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_RANGE' }));
    expect(() =>
      assertReportRange({ from: '2025-12-01', to: '2026-01-31' }),
    ).toThrow(expect.objectContaining({ code: 'RANGE_CROSSES_YEAR' }));
  });
});

describe('date helpers', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
  });

  it('takes the same number of days right before the range', () => {
    expect(previousSpan({ from: '2026-10-01', to: '2026-10-31' })).toEqual({
      from: '2026-08-31',
      to: '2026-09-30',
    });
    expect(previousSpan({ from: '2026-01-01', to: '2026-01-01' })).toEqual({
      from: '2025-12-31',
      to: '2025-12-31',
    });
  });

  it('splits a range into months clipped to its ends', () => {
    const spans = monthSpans({ from: '2026-10-15', to: '2026-12-10' });

    expect(spans).toEqual([
      { year: 2026, month: 10, from: '2026-10-15', to: '2026-10-31' },
      { year: 2026, month: 11, from: '2026-11-01', to: '2026-11-30' },
      { year: 2026, month: 12, from: '2026-12-01', to: '2026-12-10' },
    ]);
    expect(monthSpans({ from: '2026-01-01', to: '2026-12-31' })).toHaveLength(
      12,
    );
  });
});
