import { formatRate, percentFromRate, rateFromPercent } from './tithe-rate';

describe('tithe rates', () => {
  it('shows a fraction as a percentage in Spanish', () => {
    expect(formatRate(0.21)).toBe('21 %');
    expect(formatRate(0.1225)).toBe('12,25 %');
    expect(formatRate(0)).toBe('0 %');
  });

  it('converts typed percentages to the four decimals the API stores', () => {
    expect(rateFromPercent(21)).toBe(0.21);
    expect(rateFromPercent(12.25)).toBe(0.1225);
    expect(rateFromPercent(3)).toBe(0.03);
    // 0.07 * 100 is 7.000000000000001 in floating point.
    expect(rateFromPercent(7)).toBe(0.07);
  });

  it('converts a stored fraction back to the percentage of the form', () => {
    expect(percentFromRate(0.21)).toBe(21);
    expect(percentFromRate(0.1225)).toBe(12.25);
  });
});
