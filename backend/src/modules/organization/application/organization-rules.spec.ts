import {
  canonicalTaxId,
  districtLabel,
  formatTaxId,
  generateCongregationCode,
  normalizeCode,
  optionalEmail,
  requiredText,
} from './organization-rules.js';

describe('canonicalTaxId', () => {
  it.each([
    ['900123456-7', '900.123.456-7'],
    ['900.123.456-7', '900.123.456-7'],
    [' 12.345-6 ', '12.345-6'],
  ])('writes %s as %s', (raw, expected) => {
    expect(canonicalTaxId(raw)).toBe(expected);
  });

  it.each(['', '900123456', '900.12.456-7', 'abc-1', '900123456-77'])(
    'rejects %j',
    (raw) => {
      expect(() => canonicalTaxId(raw)).toThrow(
        expect.objectContaining({ code: 'INVALID_TAX_ID' }),
      );
    },
  );

  it('formatTaxId groups by thousands', () => {
    expect(formatTaxId('1234567890-1')).toBe('1.234.567.890-1');
  });
});

describe('generateCongregationCode', () => {
  it('uses the initials of the meaningful words', () => {
    expect(generateCongregationCode('Monte de Sión Cartagena', new Set())).toBe(
      'MSC',
    );
  });

  it('skips generic words and falls back to the first letters of a single word', () => {
    expect(generateCongregationCode('Sede Central', new Set())).toBe('CEN');
    expect(
      generateCongregationCode('Iglesia Cristiana Bethel', new Set()),
    ).toBe('CB');
  });

  it('removes accents and symbols and never returns fewer than two characters', () => {
    expect(generateCongregationCode('Ñandú Éxodo', new Set())).toBe('NE');
    expect(generateCongregationCode('A', new Set())).toBe('AX');
  });

  it('appends a number when the code is taken, ignoring case', () => {
    expect(
      generateCongregationCode('Monte de Sión Cartagena', new Set(['msc'])),
    ).toBe('MSC2');
    expect(
      generateCongregationCode(
        'Monte de Sión Cartagena',
        new Set(['MSC', 'MSC2']),
      ),
    ).toBe('MSC3');
  });
});

describe('text helpers', () => {
  it('normalizeCode keeps upper-case letters and digits', () => {
    expect(normalizeCode(' ch-1 ')).toBe('CH1');
  });

  it('requiredText collapses spaces and enforces the limit', () => {
    expect(requiredText('  a   b ', 'El dato', 10)).toBe('a b');
    expect(() => requiredText('   ', 'El dato', 10)).toThrow(
      expect.objectContaining({ code: 'REQUIRED' }),
    );
    expect(() => requiredText('x'.repeat(11), 'El dato', 10)).toThrow(
      expect.objectContaining({ code: 'TOO_LONG' }),
    );
  });

  it('optionalEmail lowercases and validates', () => {
    expect(optionalEmail(' A@B.co ')).toBe('a@b.co');
    expect(optionalEmail('')).toBeNull();
    expect(() => optionalEmail('nope')).toThrow(
      expect.objectContaining({ code: 'INVALID_EMAIL' }),
    );
  });

  it('districtLabel prefers the name', () => {
    expect(districtLabel({ number: '3', name: 'Caribe' })).toBe('3 · Caribe');
    expect(districtLabel({ number: '3', name: null })).toBe('Distrito 3');
  });
});
