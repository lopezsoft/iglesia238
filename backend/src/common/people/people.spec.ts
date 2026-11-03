import { ADULT_AGE, ageOn, isMinorOn } from './age.js';
import { normalizeDocumentNumber } from './document-number.js';
import { composeFullName } from './full-name.js';

describe('normalizeDocumentNumber', () => {
  it('removes dots, dashes and spaces and uppercases', () => {
    expect(normalizeDocumentNumber(' 1.023.456-789 ')).toBe('1023456789');
    expect(normalizeDocumentNumber('ab 12-3')).toBe('AB123');
  });
});

describe('ageOn', () => {
  it('counts a year only after the birthday', () => {
    expect(ageOn('2008-06-15', '2026-06-14')).toBe(17);
    expect(ageOn('2008-06-15', '2026-06-15')).toBe(18);
    expect(ageOn('2008-06-15', '2026-12-31')).toBe(18);
  });

  it('flags minors at the day they turn of age', () => {
    expect(isMinorOn('2008-06-16', '2026-06-15')).toBe(true);
    expect(isMinorOn('2008-06-15', '2026-06-15')).toBe(false);
    expect(isMinorOn(null, '2026-06-15')).toBe(false);
    expect(ADULT_AGE).toBe(18);
  });
});

describe('composeFullName', () => {
  it('joins the present parts', () => {
    expect(composeFullName('Ana', ' Pérez ', null, undefined, 'Gómez')).toBe(
      'Ana Pérez Gómez',
    );
  });
});
