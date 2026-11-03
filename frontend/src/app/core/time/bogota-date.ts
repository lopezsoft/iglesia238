/** The church operates in Colombia: "today" is the date there, as on the server (America/Bogota). */
const BOGOTA_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Calendar date (YYYY-MM-DD) of an instant in America/Bogota, whatever the time zone of the browser.
 * The API rejects dates after its own "today", so the screens must limit dates against the same day.
 */
export function bogotaTodayIso(now: Date = new Date()): string {
  const parts = Object.fromEntries(BOGOTA_DATE.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts['year']}-${parts['month']}-${parts['day']}`;
}
