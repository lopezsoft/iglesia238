import { formatMoney } from './money.pipe';

describe('formatMoney', () => {
  it('formats Colombian pesos without decimals', () => {
    expect(formatMoney(1250000).replace(/\s/g, ' ')).toBe('$ 1.250.000');
  });

  it('shows a dash without a value', () => {
    expect(formatMoney(null)).toBe('—');
  });
});
