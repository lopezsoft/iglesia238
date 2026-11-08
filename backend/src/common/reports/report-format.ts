/** The text of the figures and dates every printed report shares, so the reports read the same. */

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const dayFormat = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

const longDayFormat = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const integer = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const percentNumber = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 1250000 becomes "$ 1.250.000". */
export function formatMoney(value: number): string {
  return money.format(value);
}

/** 2026-11-02 becomes "02/11/2026". */
export function formatShortDate(isoDate: string): string {
  return dayFormat.format(new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`));
}

/** 2026-11-02 becomes "2 de noviembre de 2026". */
export function formatLongDate(isoDate: string): string {
  return longDayFormat.format(
    new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`),
  );
}

export function formatInteger(value: number): string {
  return integer.format(value);
}

/** An average or a count with at most one decimal: 7.5 becomes "7,5". */
export function formatDecimal(value: number): string {
  return oneDecimal.format(value);
}

/** A rate between 0 and 1: 0.1 becomes "10 %". Built by hand so the space does not depend on the ICU data of the server. */
export function formatPercent(rate: number): string {
  return `${percentNumber.format(Math.round(rate * 10_000) / 100)} %`;
}

/**
 * "Fondo de Construcción" becomes "fondo-de-construccion": a file name people can read and a server can serve.
 * `fallback` is used when nothing readable is left.
 */
export function fileSlug(text: string, fallback = 'informe'): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  );
}
