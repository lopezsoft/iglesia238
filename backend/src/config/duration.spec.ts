import { parseDurationSeconds } from './duration.js';

describe('parseDurationSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['2h', 7200],
    ['7d', 604_800],
  ])('converts %s to %i seconds', (duration, seconds) => {
    expect(parseDurationSeconds(duration)).toBe(seconds);
  });

  it.each(['', '15', '0m', 'm', '1w', '-5m', '1.5h'])(
    'rejects %j',
    (duration) => {
      expect(() => parseDurationSeconds(duration)).toThrow(
        'Invalid duration format',
      );
    },
  );
});
