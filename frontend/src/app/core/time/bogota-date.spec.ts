import { bogotaTodayIso } from './bogota-date';

describe('bogotaTodayIso', () => {
  it('uses the date in Bogota, five hours behind UTC, whatever the browser time zone', () => {
    // 02:30 UTC on Nov 3 is still 21:30 on Nov 2 in Bogota.
    expect(bogotaTodayIso(new Date('2026-11-03T02:30:00.000Z'))).toBe('2026-11-02');
    expect(bogotaTodayIso(new Date('2026-11-03T05:00:00.000Z'))).toBe('2026-11-03');
  });

  it('pads month and day', () => {
    expect(bogotaTodayIso(new Date('2026-01-05T15:00:00.000Z'))).toBe('2026-01-05');
  });
});
