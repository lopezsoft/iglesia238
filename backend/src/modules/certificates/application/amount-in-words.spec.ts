import {
  MAX_AMOUNT_PESOS,
  amountInWords,
  formatPesos,
} from './amount-in-words.js';

const pesos = (n: number) => amountInWords(n * 100);

describe('amountInWords', () => {
  it.each([
    [0, 'cero pesos colombianos'],
    [1, 'un peso colombiano'],
    [2, 'dos pesos colombianos'],
    [15, 'quince pesos colombianos'],
    [21, 'veintiún pesos colombianos'],
    [30, 'treinta pesos colombianos'],
    [31, 'treinta y un pesos colombianos'],
    [99, 'noventa y nueve pesos colombianos'],
    [100, 'cien pesos colombianos'],
    [101, 'ciento un pesos colombianos'],
    [121, 'ciento veintiún pesos colombianos'],
    [500, 'quinientos pesos colombianos'],
    [999, 'novecientos noventa y nueve pesos colombianos'],
  ])('writes %i pesos', (value, expected) => {
    expect(pesos(value)).toBe(expected);
  });

  it.each([
    [1_000, 'mil pesos colombianos'],
    [1_001, 'mil un pesos colombianos'],
    [2_000, 'dos mil pesos colombianos'],
    [21_000, 'veintiún mil pesos colombianos'],
    [31_000, 'treinta y un mil pesos colombianos'],
    [100_000, 'cien mil pesos colombianos'],
    [250_000, 'doscientos cincuenta mil pesos colombianos'],
    [
      999_999,
      'novecientos noventa y nueve mil novecientos noventa y nueve pesos colombianos',
    ],
  ])('writes %i pesos (thousands)', (value, expected) => {
    expect(pesos(value)).toBe(expected);
  });

  it.each([
    [1_000_000, 'un millón de pesos colombianos'],
    [2_000_000, 'dos millones de pesos colombianos'],
    [1_250_000, 'un millón doscientos cincuenta mil pesos colombianos'],
    [1_000_001, 'un millón un pesos colombianos'],
    [21_000_000, 'veintiún millones de pesos colombianos'],
    [
      123_456_789,
      'ciento veintitrés millones cuatrocientos cincuenta y seis mil setecientos ochenta y nueve pesos colombianos',
    ],
    [1_000_000_000, 'mil millones de pesos colombianos'],
    [2_500_000_000, 'dos mil quinientos millones de pesos colombianos'],
    [
      MAX_AMOUNT_PESOS,
      'novecientos noventa y nueve mil novecientos noventa y nueve millones novecientos noventa y nueve mil novecientos noventa y nueve pesos colombianos',
    ],
  ])('writes %i pesos (millions)', (value, expected) => {
    expect(pesos(value)).toBe(expected);
  });

  it('writes the cents when there are any', () => {
    expect(amountInWords(150_050)).toBe(
      'mil quinientos pesos colombianos con cincuenta centavos',
    );
    expect(amountInWords(101)).toBe('un peso colombiano con un centavo');
    expect(amountInWords(5)).toBe('cinco centavos');
    expect(amountInWords(2_100)).toBe('veintiún pesos colombianos');
    expect(amountInWords(2_121)).toBe(
      'veintiún pesos colombianos con veintiún centavos',
    );
  });

  it('rejects what it cannot write instead of printing a wrong amount', () => {
    expect(() => amountInWords(-1)).toThrow(RangeError);
    expect(() => amountInWords(1.5)).toThrow(RangeError);
    expect(() => amountInWords(Number.NaN)).toThrow(RangeError);
    expect(() => amountInWords((MAX_AMOUNT_PESOS + 1) * 100)).toThrow(
      RangeError,
    );
  });
});

describe('formatPesos', () => {
  it.each([
    [0, '$0'],
    [100, '$1'],
    [99_900, '$999'],
    [100_000, '$1.000'],
    [125_000_000, '$1.250.000'],
    [123_456_789_000, '$1.234.567.890'],
    [150_050, '$1.500,50'],
    [5, '$0,05'],
  ])('formats %i cents as %s', (cents, expected) => {
    expect(formatPesos(cents)).toBe(expected);
  });
});
