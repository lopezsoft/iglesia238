import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  ServiceUnavailableDomainException,
  TooManyRequestsException,
} from '../errors/domain.exception.js';
import { SmartLogger } from '../logging/smart-logger.service.js';
import {
  RATE_LIMITER,
  type RateLimiter,
  type RateLimitRule,
} from './rate-limiter.port.js';

/**
 * What to do when the counter store is down. Sign-in closes (no counter, no attempts, so brute force
 * stays impossible); public forms open and log it (an outage of Redis must not take the forms down).
 */
export type RateLimitFailurePolicy = 'open' | 'closed';

/** Builds the counter key. The identity (an IP or an email) is hashed: it never reaches Redis in clear. */
export function rateLimitKey(name: string, identity: string): string {
  const digest = createHash('sha256').update(identity).digest('hex');
  return `${name}:${digest.slice(0, 32)}`;
}

@Injectable()
export class RateLimitService {
  constructor(
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    private readonly logger: SmartLogger,
  ) {}

  /** Counts an attempt and throws 429 when the limit is exceeded. */
  async enforce(
    name: string,
    identity: string,
    rule: RateLimitRule,
    onFailure: RateLimitFailurePolicy,
  ): Promise<void> {
    const key = rateLimitKey(name, identity);
    let decision;
    try {
      decision = await this.limiter.consume(key, rule);
    } catch {
      this.logger.warn(
        `Rate limiter unavailable for "${name}" (policy: ${onFailure})`,
        RateLimitService.name,
      );
      if (onFailure === 'closed') {
        throw new ServiceUnavailableDomainException();
      }
      return;
    }

    if (!decision.allowed) {
      throw new TooManyRequestsException(decision.retryAfterSeconds);
    }
  }

  /** Forgets the attempts of an identity. A failure is not important: the window expires by itself. */
  async reset(name: string, identity: string): Promise<void> {
    try {
      await this.limiter.reset(rateLimitKey(name, identity));
    } catch {
      this.logger.warn(
        `Rate limiter reset failed for "${name}"`,
        RateLimitService.name,
      );
    }
  }
}
