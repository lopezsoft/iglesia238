import { formatMoney } from '../../../shared/pipes/money.pipe';
import { DateRange, WidgetFormat } from './dashboard.models';

const INTEGER = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const SHORT_DATE = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const LONG_DATE = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Writes a widget value the way its `format` says: pesos, a count, or the text as it came. */
export function formatWidgetValue(value: number | string, format: WidgetFormat): string {
  if (typeof value === 'string' || format === 'text') {
    return String(value);
  }
  return format === 'currency' ? formatMoney(value) : INTEGER.format(value);
}

export interface Comparison {
  /** "+12 %", "-4 %", "0 %" or "Sin comparativo". */
  readonly text: string;
  readonly tone: 'up' | 'down' | 'neutral';
}

export const NO_COMPARISON: Comparison = { text: 'Sin comparativo', tone: 'neutral' };

/**
 * Percentage change against the previous period. With nothing to compare against (unknown, or zero:
 * the change would be infinite) it says so, instead of inventing a number.
 */
export function compareWithPrevious(value: number, previous: number | null): Comparison {
  if (previous === null || previous === 0) {
    return NO_COMPARISON;
  }
  const change = Math.round(((value - previous) / Math.abs(previous)) * 100);
  if (change === 0) {
    return { text: '0 %', tone: 'neutral' };
  }
  return { text: `${change > 0 ? '+' : '−'}${INTEGER.format(Math.abs(change))} %`, tone: change > 0 ? 'up' : 'down' };
}

function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** "lunes, 2 de noviembre de 2026" for one day; "27 oct – 2 nov" for a range. */
export function describeRange(range: DateRange): string {
  if (range.from === range.to) {
    const text = LONG_DATE.format(parseDay(range.from));
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return `${SHORT_DATE.format(parseDay(range.from))} – ${SHORT_DATE.format(parseDay(range.to))}`;
}
