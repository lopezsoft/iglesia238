/**
 * Runs `work` and does not return before `minimumMs` have passed, success or failure. It levels the
 * response time of endpoints that must not reveal, by being faster or slower, which branch they took
 * (for example whether an e-mail address belongs to an account).
 */
export async function withMinimumDuration<T>(
  minimumMs: number,
  work: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await work();
  } finally {
    const remaining = minimumMs - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }
  }
}
