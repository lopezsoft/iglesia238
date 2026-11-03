import { parseTrustProxy, toFastifyTrustProxy } from './trust-proxy.js';

describe('parseTrustProxy', () => {
  it.each([
    ['false', false],
    ['', false],
    ['0', false],
    ['true', true],
    ['TRUE', true],
    ['1', 1],
    ['2', 2],
    ['172.18.0.0/16', ['172.18.0.0/16']],
    ['10.0.0.1, 172.18.0.0/16', ['10.0.0.1', '172.18.0.0/16']],
    ['loopback,::1', ['loopback', '::1']],
    ['fd00::/8', ['fd00::/8']],
  ])('reads %j', (raw, expected) => {
    expect(parseTrustProxy(raw)).toEqual(expected);
  });

  it.each([
    'yes',
    '300',
    '10.0.0.0/33',
    '10.0.0.1/',
    'banana,1.2.3.4',
    '1.2.3.4/8/9',
  ])('rejects %j', (raw) => {
    expect(parseTrustProxy(raw)).toBeNull();
  });

  it('passes real booleans through and rejects other types', () => {
    expect(parseTrustProxy(true)).toBe(true);
    expect(parseTrustProxy(false)).toBe(false);
    expect(parseTrustProxy(5)).toBeNull();
  });
});

describe('toFastifyTrustProxy', () => {
  it('keeps booleans and address lists', () => {
    expect(toFastifyTrustProxy(false)).toBe(false);
    expect(toFastifyTrustProxy(['10.0.0.1'])).toEqual(['10.0.0.1']);
  });

  it('turns a hop count into a function that trusts only that many hops', () => {
    const trust = toFastifyTrustProxy(1);

    expect(typeof trust).toBe('function');
    const fn = trust as (address: string, hop: number) => boolean;
    expect(fn('10.0.0.1', 0)).toBe(true);
    expect(fn('203.0.113.9', 1)).toBe(false);
  });
});
