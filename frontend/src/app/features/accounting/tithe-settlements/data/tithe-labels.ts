import { TitheComponent, TitheComponentKey, TitheRuleView } from './tithe-settlements.models';

/** 0.27 → "27 %", 0.315 → "31,5 %". */
export function percentLabel(rate: number): string {
  const value = Math.round(rate * 1000) / 10;
  return `${String(value).replace('.', ',')} %`;
}

export const COMPONENT_NAMES: Readonly<Record<TitheComponentKey, string>> = {
  NATIONAL: 'Participación nacional (diezmo de diezmos)',
  LOCAL_FUND: 'Fondo local',
  PASTOR: 'Asignación pastoral',
};

export interface ComponentContext {
  readonly denominationName: string;
  readonly congregationName: string;
  readonly localFundName: string | null;
}

/** Who receives the component, as the sede names them. */
export function componentTarget(key: TitheComponentKey, context: ComponentContext): string {
  switch (key) {
    case 'NATIONAL':
      return context.denominationName;
    case 'LOCAL_FUND':
      return `${context.localFundName ?? 'Fondo local'} · ${context.congregationName}`;
    case 'PASTOR':
      return `Pastor de ${context.congregationName}`;
  }
}

/** "10 %", "30 % del neto (27 % del bruto)", "63 % del bruto". */
export function componentRateLabel(component: TitheComponent, rule: Pick<TitheRuleView, 'nationalShareRate' | 'localFundRate'>): string {
  switch (component.key) {
    case 'NATIONAL':
      return percentLabel(rule.nationalShareRate);
    case 'LOCAL_FUND':
      return `${percentLabel(rule.localFundRate)} del neto (${percentLabel(component.rate)} del bruto)`;
    case 'PASTOR':
      return `${percentLabel(component.rate)} del bruto`;
  }
}

/** "Cuenta 530505 · Fondo Local" or the reason the cash is not touched. */
export function bookingLabel(component: TitheComponent): string {
  if (component.booking) {
    return `${component.booking.accountCode} · ${component.booking.accountName} (${component.booking.fundName})`;
  }
  return component.key === 'LOCAL_FUND' ? 'Se queda en el fondo local' : 'Sin movimiento de caja';
}
