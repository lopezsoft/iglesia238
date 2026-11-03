import { Prisma } from '../../generated/prisma/client.js';
import {
  bigIntToNumber,
  decimalToNumber,
  decimalToNumberOrNull,
  isIsoDate,
  parseIsoDate,
  toIsoDate,
  toIsoDateOrNull,
  toIsoDateTime,
  toIsoDateTimeOrNull,
} from './value-mappers.js';

describe('value mappers', () => {
  describe('money', () => {
    it('converts a Prisma.Decimal to a number', () => {
      expect(decimalToNumber(new Prisma.Decimal('1234567.89'))).toBe(
        1234567.89,
      );
      expect(decimalToNumber(new Prisma.Decimal('0.2100'))).toBe(0.21);
    });

    it('keeps null as null', () => {
      expect(decimalToNumberOrNull(null)).toBeNull();
      expect(decimalToNumberOrNull(undefined)).toBeNull();
      expect(decimalToNumberOrNull(new Prisma.Decimal('5'))).toBe(5);
    });
  });

  describe('bigint', () => {
    it('converts a safe BigInt', () => {
      expect(bigIntToNumber(123n)).toBe(123);
    });

    it('refuses a BigInt that would lose precision', () => {
      expect(() =>
        bigIntToNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
      ).toThrow(RangeError);
    });

    it('makes AuditLog ids serializable', () => {
      expect(() => JSON.stringify({ id: 1n })).toThrow();
      expect(JSON.stringify({ id: bigIntToNumber(1n) })).toBe('{"id":1}');
    });
  });

  describe('dates', () => {
    it('formats a DATE column as YYYY-MM-DD from its UTC day', () => {
      expect(toIsoDate(new Date('2026-11-02T00:00:00.000Z'))).toBe(
        '2026-11-02',
      );
      expect(toIsoDateOrNull(null)).toBeNull();
      expect(toIsoDateOrNull(new Date('2026-01-31T00:00:00.000Z'))).toBe(
        '2026-01-31',
      );
    });

    it('formats timestamps as ISO 8601', () => {
      expect(toIsoDateTime(new Date('2026-11-02T15:30:00Z'))).toBe(
        '2026-11-02T15:30:00.000Z',
      );
      expect(toIsoDateTimeOrNull(undefined)).toBeNull();
    });

    it('parses YYYY-MM-DD as midnight UTC, so the day never shifts', () => {
      const date = parseIsoDate('2026-03-01');

      expect(date.toISOString()).toBe('2026-03-01T00:00:00.000Z');
      expect(toIsoDate(date)).toBe('2026-03-01');
    });

    it.each([
      '2026-02-30',
      '2026-13-01',
      '2026-1-1',
      '01/02/2026',
      '',
      '2026-02-30T00:00:00Z',
    ])('rejects the invalid date %j', (value) => {
      expect(isIsoDate(value)).toBe(false);
      expect(() => parseIsoDate(value)).toThrow(RangeError);
    });

    it('accepts a leap day only in a leap year', () => {
      expect(isIsoDate('2028-02-29')).toBe(true);
      expect(isIsoDate('2026-02-29')).toBe(false);
    });
  });
});
