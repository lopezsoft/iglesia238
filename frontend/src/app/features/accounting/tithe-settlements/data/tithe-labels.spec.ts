import { COMPONENT_NAMES, bookingLabel, componentRateLabel, componentTarget, percentLabel } from './tithe-labels';
import { TitheComponent } from './tithe-settlements.models';

const RULE = { nationalShareRate: 0.1, localFundRate: 0.3 };
const BOOKED: TitheComponent = {
  key: 'NATIONAL',
  rate: 0.1,
  amount: 323_000,
  booking: { accountCode: '530505', accountName: 'Cuota de la denominación', fundName: 'Fondo Local' },
};

describe('tithe labels', () => {
  it('writes a rate as a percentage with the comma of es-CO', () => {
    expect(percentLabel(0.27)).toBe('27 %');
    expect(percentLabel(0.315)).toBe('31,5 %');
    expect(percentLabel(0)).toBe('0 %');
    expect(percentLabel(1)).toBe('100 %');
  });

  it('explains each component as the rule defines it', () => {
    expect(componentRateLabel(BOOKED, RULE)).toBe('10 %');
    expect(componentRateLabel({ key: 'LOCAL_FUND', rate: 0.27, amount: 872_100, booking: null }, RULE)).toBe(
      '30 % del neto (27 % del bruto)',
    );
    expect(componentRateLabel({ key: 'PASTOR', rate: 0.63, amount: 2_034_900, booking: null }, RULE)).toBe('63 % del bruto');
  });

  it('names who receives each component', () => {
    const context = { denominationName: 'Monte de Sión', congregationName: 'Sede Central', localFundName: 'Fondo Local' };

    expect(componentTarget('NATIONAL', context)).toBe('Monte de Sión');
    expect(componentTarget('LOCAL_FUND', context)).toBe('Fondo Local · Sede Central');
    expect(componentTarget('LOCAL_FUND', { ...context, localFundName: null })).toBe('Fondo local · Sede Central');
    expect(componentTarget('PASTOR', context)).toBe('Pastor de Sede Central');
    expect(COMPONENT_NAMES.PASTOR).toBe('Asignación pastoral');
  });

  it('tells where the cash line is booked or why it is not', () => {
    expect(bookingLabel(BOOKED)).toBe('530505 · Cuota de la denominación (Fondo Local)');
    expect(bookingLabel({ key: 'LOCAL_FUND', rate: 0.27, amount: 1, booking: null })).toBe('Se queda en el fondo local');
    expect(bookingLabel({ ...BOOKED, booking: null })).toBe('Sin movimiento de caja');
  });
});
