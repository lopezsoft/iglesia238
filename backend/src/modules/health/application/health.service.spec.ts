import { SmartLogger } from '../../../common/logging/smart-logger.service.js';
import { HealthIndicator } from './health-indicator.port.js';
import { HealthService } from './health.service.js';

const logger = { warn: vi.fn() } as unknown as SmartLogger;

const indicator = (
  name: string,
  check: () => Promise<void>,
): HealthIndicator => ({ name, check });

describe('HealthService', () => {
  it('is ready when every dependency responds', async () => {
    const service = new HealthService(
      [
        indicator('database', () => Promise.resolve()),
        indicator('redis', () => Promise.resolve()),
      ],
      logger,
    );

    await expect(service.getReadiness()).resolves.toEqual({
      isReady: true,
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('is not ready when a dependency fails, and reports which one', async () => {
    const service = new HealthService(
      [
        indicator('database', () => Promise.resolve()),
        indicator('redis', () => Promise.reject(new Error('refused'))),
      ],
      logger,
    );

    await expect(service.getReadiness()).resolves.toEqual({
      isReady: false,
      checks: { database: 'up', redis: 'down' },
    });
  });

  it('treats a hung dependency as down', async () => {
    vi.useFakeTimers();
    const service = new HealthService(
      [indicator('database', () => new Promise<void>(() => undefined))],
      logger,
    );

    const report = service.getReadiness();
    await vi.advanceTimersByTimeAsync(2000);

    await expect(report).resolves.toMatchObject({ isReady: false });
    vi.useRealTimers();
  });
});
