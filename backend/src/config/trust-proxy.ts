import { isIP } from 'node:net';

/**
 * What Fastify accepts for `trustProxy`: nothing (false), every hop (true: spoofable when the proxy
 * appends to X-Forwarded-For), a number of trusted hops, or the proxies' addresses/ranges.
 */
export type TrustProxySetting = boolean | number | string[];

const KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

function isProxyAddress(entry: string): boolean {
  if (KEYWORDS.has(entry)) {
    return true;
  }
  const [address, prefix, ...rest] = entry.split('/');
  const family = isIP(address);
  if (family === 0 || rest.length > 0) {
    return false;
  }
  if (prefix === undefined) {
    return true;
  }
  const bits = Number(prefix);
  return /^\d+$/.test(prefix) && bits <= (family === 4 ? 32 : 128);
}

/**
 * Reads the TRUST_PROXY variable: `false`, `true`, a hop count (`1`) or a comma-separated list of
 * proxy addresses/CIDR ranges (`172.18.0.0/16,10.0.0.1`). Returns null when it is none of those.
 */
export function parseTrustProxy(raw: unknown): TrustProxySetting | null {
  if (typeof raw === 'boolean') {
    return raw;
  }
  if (typeof raw !== 'string') {
    return null;
  }
  const value = raw.trim().toLowerCase();
  if (value === 'true') {
    return true;
  }
  if (value === 'false' || value === '' || value === '0') {
    return false;
  }
  if (/^\d{1,2}$/.test(value)) {
    return Number(value);
  }
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return entries.length > 0 && entries.every(isProxyAddress) ? entries : null;
}

/**
 * The form Fastify's typings accept. A hop count becomes a function that trusts the first N hops
 * (the proxies closest to the server), so the address a client puts in X-Forwarded-For is ignored.
 */
export function toFastifyTrustProxy(
  setting: TrustProxySetting,
): boolean | string[] | ((address: string, hop: number) => boolean) {
  return typeof setting === 'number'
    ? (_address, hop) => hop < setting
    : setting;
}
