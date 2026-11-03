/** Anything with a toNumber(), such as Prisma.Decimal. */
interface NumericLike {
  toNumber(): number;
}

/** Money and rates: Decimal(14,2) values are far below 2^53, so a number is exact for the frontend. */
export function decimalToNumber(value: NumericLike): number {
  return value.toNumber();
}

export function decimalToNumberOrNull(
  value: NumericLike | null | undefined,
): number | null {
  return value === null || value === undefined ? null : value.toNumber();
}

/** AuditLog.id is a BigInt; JSON cannot carry it, and the frontend expects a number. */
export function bigIntToNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('The value does not fit in a safe integer');
  }
  return Number(value);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `@db.Date` columns come back as midnight UTC; their calendar day is the UTC day. */
export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toIsoDateOrNull(value: Date | null | undefined): string | null {
  return value === null || value === undefined ? null : toIsoDate(value);
}

/** Timestamps travel as ISO 8601 in UTC. */
export function toIsoDateTime(value: Date): string {
  return value.toISOString();
}

export function toIsoDateTimeOrNull(
  value: Date | null | undefined,
): string | null {
  return value === null || value === undefined ? null : toIsoDateTime(value);
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && toIsoDate(date) === value;
}

/** Parses YYYY-MM-DD as midnight UTC, so the stored day never shifts with the server time zone. */
export function parseIsoDate(value: string): Date {
  if (!isIsoDate(value)) {
    throw new RangeError('Invalid date, expected YYYY-MM-DD');
  }
  return new Date(`${value}T00:00:00.000Z`);
}
