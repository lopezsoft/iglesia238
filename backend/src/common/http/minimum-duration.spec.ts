import { withMinimumDuration } from './minimum-duration.js';

describe('withMinimumDuration', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits out the rest of the minimum when the work is faster', async () => {
    let done = false;
    const pending = withMinimumDuration(300, () => Promise.resolve('ok')).then(
      (value) => {
        done = true;
        return value;
      },
    );

    await vi.advanceTimersByTimeAsync(299);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toBe('ok');
  });

  it('does not add time when the work already took longer', async () => {
    const pending = withMinimumDuration(100, async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return 1;
    });

    await vi.advanceTimersByTimeAsync(250);

    await expect(pending).resolves.toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('levels the failure path too and rethrows the error', async () => {
    let settled = false;
    const pending = withMinimumDuration(200, () =>
      Promise.reject(new Error('boom')),
    ).catch((error: Error) => {
      settled = true;
      return error.message;
    });

    await vi.advanceTimersByTimeAsync(199);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toBe('boom');
  });
});
