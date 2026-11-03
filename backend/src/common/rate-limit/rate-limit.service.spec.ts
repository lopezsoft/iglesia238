import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ServiceUnavailableDomainException,
  TooManyRequestsException,
} from '../errors/domain.exception.js';
import { SmartLogger } from '../logging/smart-logger.service.js';
import { RateLimit } from './rate-limit.decorator.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { RateLimitService, rateLimitKey } from './rate-limit.service.js';
import { RateLimiter } from './rate-limiter.port.js';

/** In-memory fixed-window counter; `down` simulates a Redis outage. */
class FakeRateLimiter implements RateLimiter {
  readonly counts = new Map<string, number>();
  down = false;

  consume(key: string, rule: { limit: number; windowSeconds: number }) {
    if (this.down) {
      throw new Error('redis down');
    }
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return Promise.resolve({
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds: rule.windowSeconds,
    });
  }

  reset(key: string) {
    if (this.down) {
      throw new Error('redis down');
    }
    this.counts.delete(key);
    return Promise.resolve();
  }
}

function setup() {
  const limiter = new FakeRateLimiter();
  const warn = vi.fn();
  const service = new RateLimitService(limiter, {
    warn,
  } as unknown as SmartLogger);
  return { limiter, service, warn };
}

const RULE = { limit: 2, windowSeconds: 60 };

describe('RateLimitService', () => {
  it('allows attempts up to the limit and then answers 429', async () => {
    const { service } = setup();

    await service.enforce('login-ip', '10.0.0.1', RULE, 'closed');
    await service.enforce('login-ip', '10.0.0.1', RULE, 'closed');
    await expect(
      service.enforce('login-ip', '10.0.0.1', RULE, 'closed'),
    ).rejects.toBeInstanceOf(TooManyRequestsException);
  });

  it('counts each identity and each counter name separately', async () => {
    const { service } = setup();
    await service.enforce('login-ip', '10.0.0.1', RULE, 'closed');
    await service.enforce('login-ip', '10.0.0.1', RULE, 'closed');

    await expect(
      service.enforce('login-ip', '10.0.0.2', RULE, 'closed'),
    ).resolves.toBeUndefined();
    await expect(
      service.enforce('login-email', '10.0.0.1', RULE, 'closed'),
    ).resolves.toBeUndefined();
  });

  it('never stores the identity in clear', async () => {
    const { service, limiter } = setup();

    await service.enforce('login-email', 'maria@iglesia.org', RULE, 'closed');

    const [key] = [...limiter.counts.keys()];
    expect(key).toBe(rateLimitKey('login-email', 'maria@iglesia.org'));
    expect(key).not.toContain('maria');
    expect(key).toMatch(/^login-email:[0-9a-f]{32}$/);
  });

  it('closes when the store is down and the policy is closed (sign-in)', async () => {
    const { service, limiter, warn } = setup();
    limiter.down = true;

    await expect(
      service.enforce('login-ip', '10.0.0.1', RULE, 'closed'),
    ).rejects.toBeInstanceOf(ServiceUnavailableDomainException);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('opens and logs when the store is down and the policy is open (public forms)', async () => {
    const { service, limiter, warn } = setup();
    limiter.down = true;

    await expect(
      service.enforce('public-application', '10.0.0.1', RULE, 'open'),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('10.0.0.1');
  });

  it('forgets the attempts after a reset', async () => {
    const { service } = setup();
    await service.enforce('login-email', 'a@b.co', RULE, 'closed');
    await service.enforce('login-email', 'a@b.co', RULE, 'closed');

    await service.reset('login-email', 'a@b.co');

    await expect(
      service.enforce('login-email', 'a@b.co', RULE, 'closed'),
    ).resolves.toBeUndefined();
  });

  it('survives a failing reset', async () => {
    const { service, limiter } = setup();
    limiter.down = true;

    await expect(
      service.reset('login-email', 'a@b.co'),
    ).resolves.toBeUndefined();
  });
});

describe('RateLimitGuard and @RateLimit()', () => {
  class Routes {
    @RateLimit({ name: 'public-application', limit: 1, windowSeconds: 60 })
    limited(): void {}

    unlimited(): void {}
  }

  const contextFor = (handler: keyof Routes, ip?: string) =>
    ({
      getHandler: () =>
        (Routes.prototype as unknown as Record<string, () => void>)[handler],
      getClass: () => Routes,
      switchToHttp: () => ({ getRequest: () => ({ headers: {}, ip }) }),
    }) as unknown as ExecutionContext;

  it('limits per client IP using the options of the decorator', async () => {
    const { service } = setup();
    const guard = new RateLimitGuard(new Reflector(), service);

    await expect(
      guard.canActivate(contextFor('limited', '1.1.1.1')),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor('limited', '1.1.1.1')),
    ).rejects.toBeInstanceOf(TooManyRequestsException);
    await expect(
      guard.canActivate(contextFor('limited', '2.2.2.2')),
    ).resolves.toBe(true);
  });

  it('does nothing on routes without the decorator', async () => {
    const { service, limiter } = setup();
    const guard = new RateLimitGuard(new Reflector(), service);

    await expect(
      guard.canActivate(contextFor('unlimited', '1.1.1.1')),
    ).resolves.toBe(true);
    expect(limiter.counts.size).toBe(0);
  });

  it('keeps public routes open when Redis is down (default policy)', async () => {
    const { service, limiter } = setup();
    limiter.down = true;
    const guard = new RateLimitGuard(new Reflector(), service);

    await expect(
      guard.canActivate(contextFor('limited', '1.1.1.1')),
    ).resolves.toBe(true);
  });
});
