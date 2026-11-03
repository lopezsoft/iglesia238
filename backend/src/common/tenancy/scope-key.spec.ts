import { InvalidInputException } from '../errors/domain.exception.js';
import { formatScopeKey, parseScopeKey } from './scope-key.js';

describe('parseScopeKey', () => {
  it('parses the platform scope', () => {
    expect(parseScopeKey('P')).toEqual({
      kind: 'PLATFORM',
      scopeKey: 'P',
      denominationId: null,
      congregationId: null,
    });
  });

  it('parses a denomination scope', () => {
    expect(parseScopeKey('D:12')).toMatchObject({
      kind: 'DENOMINATION',
      denominationId: 12,
      congregationId: null,
    });
  });

  it('parses a congregation scope', () => {
    expect(parseScopeKey('C:345')).toMatchObject({
      kind: 'CONGREGATION',
      denominationId: null,
      congregationId: 345,
    });
  });

  it.each([
    '',
    'p',
    'X:1',
    'D:',
    'D:0',
    'D:01',
    'D:-1',
    'C:1.5',
    'C:1 ',
    ' C:1',
    'D:99999999999',
    'D:1;DROP TABLE',
    'C:1,C:2',
  ])('rejects the malformed scope %j', (raw) => {
    expect(() => parseScopeKey(raw)).toThrow(InvalidInputException);
  });

  it('answers with the SCOPE_INVALID code', () => {
    try {
      parseScopeKey('nope');
      expect.unreachable();
    } catch (error) {
      expect((error as InvalidInputException).code).toBe('SCOPE_INVALID');
    }
  });
});

describe('formatScopeKey', () => {
  it('is the inverse of parseScopeKey', () => {
    expect(formatScopeKey('PLATFORM')).toBe('P');
    expect(formatScopeKey('DENOMINATION', 3)).toBe('D:3');
    expect(formatScopeKey('CONGREGATION', 9)).toBe('C:9');
    expect(
      parseScopeKey(formatScopeKey('CONGREGATION', 9)).congregationId,
    ).toBe(9);
  });
});
