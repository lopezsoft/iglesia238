import {
  AGE_RANGE_BOUNDS,
  ageOn,
  birthBoundsForAges,
  isMinorOn,
  minusYears,
} from './member-rules.js';
import {
  maskDocument,
  normalizeDocument,
  parseMemberCode,
} from './person-text.js';

describe('member rules', () => {
  it('computes whole years of age', () => {
    expect(ageOn('2000-11-02', '2026-11-02')).toBe(26);
    expect(ageOn('2000-11-03', '2026-11-02')).toBe(25);
    expect(ageOn(null, '2026-11-02')).toBeNull();
  });

  it('detects minors on the given day', () => {
    expect(isMinorOn('2008-11-03', '2026-11-02')).toBe(true);
    expect(isMinorOn('2008-11-02', '2026-11-02')).toBe(false);
    expect(isMinorOn(null, '2026-11-02')).toBe(false);
  });

  it('subtracts years and falls back from 29 February', () => {
    expect(minusYears('2026-11-02', 18)).toBe('2008-11-02');
    expect(minusYears('2028-02-29', 1)).toBe('2027-02-28');
  });

  it('translates an age range into birth dates', () => {
    const today = '2026-11-02';
    expect(birthBoundsForAges(AGE_RANGE_BOUNDS.SENIORS, today)).toEqual({
      bornOnOrBefore: '1966-11-02',
      bornOnOrAfter: null,
    });
    expect(birthBoundsForAges(AGE_RANGE_BOUNDS.CHILDREN, today)).toEqual({
      bornOnOrBefore: null,
      // Eleven on the day: whoever turns 12 tomorrow was born on 2014-11-03.
      bornOnOrAfter: '2014-11-03',
    });
    expect(birthBoundsForAges(AGE_RANGE_BOUNDS.ALL, today)).toEqual({
      bornOnOrBefore: null,
      bornOnOrAfter: null,
    });
  });
});

describe('person text helpers', () => {
  it('normalizes documents for comparison', () => {
    expect(normalizeDocument('52.418-916 ')).toBe('52418916');
    expect(normalizeDocument('ab 123')).toBe('AB123');
  });

  it('masks the document and never returns the full number', () => {
    expect(maskDocument('CC', '52418916')).toBe('CC ···· 8916');
    expect(maskDocument(null, '52418916')).toBe('···· 8916');
    expect(maskDocument('CC', null)).toBeNull();
    expect(maskDocument('CC', '52418916')).not.toContain('5241');
  });

  it('recognizes member codes', () => {
    expect(parseMemberCode('sc-0130')).toEqual({ code: 'SC', number: 130 });
    expect(parseMemberCode('Ana María')).toBeNull();
  });
});
