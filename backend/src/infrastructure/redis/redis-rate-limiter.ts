import { Injectable } from '@nestjs/common';
import {
  RateLimitDecision,
  RateLimiter,
  RateLimitRule,
} from '../../common/rate-limit/rate-limiter.port.js';
import { RedisService } from './redis.service.js';

const KEY_PREFIX = 'rl:';

/** Fixed-window counter on Redis (SET NX EX + INCR in one MULTI, so a counter never lacks a TTL). */
@Injectable()
export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: RedisService) {}

  async consume(
    key: string,
    { limit, windowSeconds }: RateLimitRule,
  ): Promise<RateLimitDecision> {
    const redisKey = `${KEY_PREFIX}${key}`;
    const results = await this.redis.client
      .multi()
      .set(redisKey, 0, 'EX', windowSeconds, 'NX')
      .incr(redisKey)
      .ttl(redisKey)
      .exec();

    const count = Number(results?.[1]?.[1]);
    const ttl = Number(results?.[2]?.[1]);
    if (!Number.isFinite(count)) {
      throw new Error('Rate limiter store returned an unexpected reply');
    }

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  }

  async reset(key: string): Promise<void> {
    await this.redis.client.del(`${KEY_PREFIX}${key}`);
  }
}
