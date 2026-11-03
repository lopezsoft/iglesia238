import { parseFormData } from './application-form-data.js';
import { countByFilter } from './application-status.js';
import { registryPositionOf } from './registry-position.js';
import {
  generateTrackingCode,
  hashTrackingCode,
  normalizeTrackingCode,
  TRACKING_CODE_PATTERN,
} from './tracking-code.js';

describe('registryPositionOf', () => {
  it('fills a book of 100 folios before opening the next', () => {
    expect(registryPositionOf(1)).toEqual({ book: '1', folio: '1' });
    expect(registryPositionOf(100)).toEqual({ book: '1', folio: '100' });
    expect(registryPositionOf(101)).toEqual({ book: '2', folio: '1' });
  });
});

describe('tracking code', () => {
  it('generates codes in the documented shape', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateTrackingCode()).toMatch(TRACKING_CODE_PATTERN);
    }
  });

  it('hashes the normalized code, so spelling does not matter', () => {
    expect(hashTrackingCode(' ig-7f3k-92qd ')).toBe(
      hashTrackingCode('IG-7F3K-92QD'),
    );
    expect(hashTrackingCode('IG-7F3K-92QD')).toHaveLength(64);
    expect(normalizeTrackingCode(' ig-7f3k-92qd ')).toBe('IG-7F3K-92QD');
  });
});

describe('countByFilter', () => {
  it('groups PENDING and IN_REVIEW under the pending chip', () => {
    expect(
      countByFilter({ PENDING: 2, IN_REVIEW: 1, APPROVED: 4, DUPLICATE: 1 }),
    ).toEqual({ PENDING: 3, DUPLICATE: 1, APPROVED: 4, REJECTED: 0, ALL: 8 });
  });
});

describe('parseFormData', () => {
  it('survives an empty or malformed column', () => {
    expect(parseFormData(null).guardian).toBeNull();
    expect(parseFormData('x').sex).toBe('FEMALE');
  });

  it('drops an incomplete guardian', () => {
    expect(
      parseFormData({ guardian: { firstName: 'Ana' } }).guardian,
    ).toBeNull();
  });
});
