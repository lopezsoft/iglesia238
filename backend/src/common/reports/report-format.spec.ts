import {
  fileSlug,
  formatDecimal,
  formatInteger,
  formatLongDate,
  formatMoney,
  formatPercent,
  formatShortDate,
} from './report-format.js';

describe('report formats', () => {
  it('writes money in Colombian pesos with dots for thousands', () => {
    expect(formatMoney(1_250_000)).toMatch(/1\.250\.000/);
    expect(formatMoney(1_250_000)).toContain('$');
    expect(formatMoney(0)).toMatch(/0/);
  });

  it('keeps the cents only when there are some', () => {
    expect(formatMoney(1500.5)).toMatch(/1\.500,5/);
  });

  it('writes a date as day/month/year, whatever the time zone of the server', () => {
    expect(formatShortDate('2026-11-02')).toBe('02/11/2026');
    expect(formatShortDate('2026-01-31T23:59:59.000Z')).toBe('31/01/2026');
  });

  it('writes a long date in Spanish', () => {
    expect(formatLongDate('2026-11-02')).toBe('2 de noviembre de 2026');
  });

  it('writes counts and averages the way people read them', () => {
    expect(formatInteger(12_345)).toBe('12.345');
    expect(formatDecimal(7.5)).toBe('7,5');
    expect(formatDecimal(8)).toBe('8');
    expect(formatDecimal(7.26)).toBe('7,3');
  });

  it('writes a rate between 0 and 1 as a percentage without the odd space', () => {
    expect(formatPercent(0.1)).toBe('10 %');
    expect(formatPercent(0.125)).toBe('12,5 %');
    expect(formatPercent(0.7)).toBe('70 %');
    expect(formatPercent(0.1)).not.toContain(' ');
  });

  it.each([
    ['Fondo de Construcción', 'fondo-de-construccion'],
    ['  Misiones & Ayuda / Social!! ', 'misiones-ayuda-social'],
    ['LD-2026-00005', 'ld-2026-00005'],
  ])('makes a file name out of %s', (text, expected) => {
    expect(fileSlug(text)).toBe(expected);
  });

  it('falls back when nothing readable is left', () => {
    expect(fileSlug('¿¿¿')).toBe('informe');
    expect(fileSlug('', 'todas')).toBe('todas');
  });
});
