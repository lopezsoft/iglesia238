import {
  addDays,
  buildPeriodWindow,
  daysOf,
  lastMonths,
  rangeBounds,
} from './period-window.js';

describe('buildPeriodWindow', () => {
  it('compares today with yesterday', () => {
    const window = buildPeriodWindow('today', '2026-11-02');

    expect(window.current).toEqual({ from: '2026-11-02', to: '2026-11-02' });
    expect(window.previous).toEqual({ from: '2026-11-01', to: '2026-11-01' });
    expect(window.previousLabel).toBe('ayer');
    expect(window.seriesDays).toHaveLength(7);
    expect(window.seriesDays.at(-1)).toBe('2026-11-02');
  });

  it('compares yesterday with the day before', () => {
    const window = buildPeriodWindow('yesterday', '2026-11-02');

    expect(window.current.from).toBe('2026-11-01');
    expect(window.previous.from).toBe('2026-10-31');
    expect(window.seriesDays.at(-1)).toBe('2026-11-01');
  });

  it('compares seven days with the seven before', () => {
    const window = buildPeriodWindow('7d', '2026-11-02');

    expect(window.current).toEqual({ from: '2026-10-27', to: '2026-11-02' });
    expect(window.previous).toEqual({ from: '2026-10-20', to: '2026-10-26' });
    expect(window.seriesDays).toHaveLength(7);
  });

  it('compares the month so far with the same days of the previous month', () => {
    const window = buildPeriodWindow('month', '2026-11-02');

    expect(window.current).toEqual({ from: '2026-11-01', to: '2026-11-02' });
    expect(window.previous).toEqual({ from: '2026-10-01', to: '2026-10-02' });
    expect(window.seriesDays).toEqual(['2026-11-01', '2026-11-02']);
  });

  it('clamps the previous month when it is shorter (31 March against February)', () => {
    const window = buildPeriodWindow('month', '2026-03-31');

    expect(window.previous).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('crosses the year boundary', () => {
    const window = buildPeriodWindow('month', '2026-01-15');

    expect(window.previous).toEqual({ from: '2025-12-01', to: '2025-12-15' });
  });
});

describe('date helpers', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('lists every day of a range', () => {
    expect(daysOf({ from: '2026-02-27', to: '2026-03-02' })).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });

  it('turns a range of Bogota days into UTC instants (midnight in Bogota is 05:00 UTC)', () => {
    const { gte, lt } = rangeBounds({ from: '2026-11-02', to: '2026-11-02' });

    expect(gte.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-11-03T05:00:00.000Z');
  });

  it('lists the last months oldest first, across the year boundary', () => {
    const months = lastMonths('2026-02-10', 4);

    expect(months.map((month) => month.key)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(months.map((month) => month.label)).toEqual([
      'Nov',
      'Dic',
      'Ene',
      'Feb',
    ]);
  });
});
