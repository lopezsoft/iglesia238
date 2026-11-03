export const RATE_LIMITER = Symbol('RATE_LIMITER');

export interface RateLimitRule {
  /** Attempts allowed inside the window. */
  limit: number;
  windowSeconds: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Attempts left in the window (0 when blocked). */
  remaining: number;
  /** Seconds until the window ends; useful when blocked. */
  retryAfterSeconds: number;
}

/** Fixed-window counter. Implementations throw when their store is unavailable. */
export interface RateLimiter {
  /** Counts one attempt for the key and says whether it is still within the limit. */
  consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
  /** Forgets the attempts of a key, for example after a successful sign-in. */
  reset(key: string): Promise<void>;
}
