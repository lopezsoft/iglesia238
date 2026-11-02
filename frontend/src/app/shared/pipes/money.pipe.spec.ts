import { formatMemberCode } from '../../core/demo/demo-database';
import { formatMoney } from './money.pipe';

describe('formatMoney', () => {
  it('formats Colombian pesos without decimals', () => {
    expect(formatMoney(1250000).replace(/\s/g, ' ')).toBe('$ 1.250.000');
  });

  it('shows a dash without a value', () => {
    expect(formatMoney(null)).toBe('—');
  });
});

describe('formatMemberCode', () => {
  it('uses the initials of the sede and four digits', () => {
    expect(formatMemberCode('Sede Central', 148)).toBe('SC-0148');
    expect(formatMemberCode('Vida Nueva Chapinero', 7)).toBe('VNC-0007');
  });
});
