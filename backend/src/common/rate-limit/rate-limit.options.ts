import type { RateLimitFailurePolicy } from './rate-limit.service.js';

export const RATE_LIMIT_KEY = 'rateLimit:options';

export interface RateLimitOptions {
  /** Counter name, for example "public-application". Each route family uses its own. */
  name: string;
  limit: number;
  windowSeconds: number;
  /** Default "open": a Redis outage does not block the route. */
  failure?: RateLimitFailurePolicy;
}
