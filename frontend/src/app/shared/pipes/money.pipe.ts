import { Pipe, PipeTransform } from '@angular/core';

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatMoney(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : COP.format(value);
}

/** Colombian pesos without decimals: 1250000 → "$ 1.250.000". */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatMoney(value);
  }
}
