// Small date helpers and wording shared by the certificate and card forms. The printed text itself
// is built by the API (GET /api/certificates/preview, /api/certificates/:id/pdf).

/** ISO date plus whole years; 29 February falls on 28 February in common years. */
export function addYears(isoDate: string, years: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  const targetYear = year + years;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  return isoDateOf(targetYear, month, Math.min(day, lastDay));
}

export function isoDateOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "la Sede Central" or "la sede Vida Nueva Chapinero". */
export function sedeReference(congregationName: string): string {
  return /^sede\b/i.test(congregationName)
    ? `la ${congregationName}`
    : `la sede ${congregationName}`;
}
