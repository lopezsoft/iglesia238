import { RedisRateLimiter } from './redis-rate-limiter.js';
import { RedisService } from './redis.service.js';

type Reply = [Error | null, unknown][] | null;

function createLimiter(reply: Reply) {
  const calls: string[] = [];
  const transaction = {
    set: vi.fn((...args: unknown[]) => {
      calls.push(`set ${args.join(' ')}`);
      return transaction;
    }),
    incr: vi.fn((key: string) => {
      calls.push(`incr ${key}`);
      return transaction;
    }),
    ttl: vi.fn((key: string) => {
      calls.push(`ttl ${key}`);
      return transaction;
    }),
    exec: vi.fn(() => Promise.resolve(reply)),
  };
  const del = vi.fn(() => Promise.resolve(1));
  const redis = {
    client: { multi: () => transaction, del },
  } as unknown as RedisService;
  return { limiter: new RedisRateLimiter(redis), calls, del };
}

describe('RedisRateLimiter', () => {
  const rule = { limit: 3, windowSeconds: 900 };

  it('sets the TTL together with the first increment, atomically', async () => {
    const { limiter, calls } = createLimiter([
      [null, 'OK'],
      [null, 1],
      [null, 900],
    ]);

    await limiter.consume('login:abc', rule);

    expect(calls).toEqual([
      'set rl:login:abc 0 EX 900 NX',
      'incr rl:login:abc',
      'ttl rl:login:abc',
    ]);
  });

  it('allows the attempts up to the limit', async () => {
    const { limiter } = createLimiter([
      [null, null],
      [null, 3],
      [null, 400],
    ]);

    await expect(limiter.consume('k', rule)).resolves.toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 400,
    });
  });

  it('blocks the attempt that exceeds the limit', async () => {
    const { limiter } = createLimiter([
      [null, null],
      [null, 4],
      [null, 321],
    ]);

    await expect(limiter.consume('k', rule)).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 321,
    });
  });

  it('falls back to the window when the key has no TTL', async () => {
    const { limiter } = createLimiter([
      [null, null],
      [null, 1],
      [null, -1],
    ]);

    expect((await limiter.consume('k', rule)).retryAfterSeconds).toBe(900);
  });

  it('fails when Redis answers nothing usable, so the caller applies its policy', async () => {
    await expect(
      createLimiter(null).limiter.consume('k', rule),
    ).rejects.toThrow();
  });

  it('deletes the counter on reset', async () => {
    const { limiter, del } = createLimiter(null);

    await limiter.reset('login:abc');

    expect(del).toHaveBeenCalledWith('rl:login:abc');
  });
});
