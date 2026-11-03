/** A whole number followed by s, m, h or d: 30s, 15m, 1h, 7d. */
export const DURATION_PATTERN = /^[1-9]\d{0,5}[smhd]$/;

const SECONDS_PER_UNIT = { s: 1, m: 60, h: 3600, d: 86_400 } as const;

/** Converts a validated duration such as "15m" to seconds. */
export function parseDurationSeconds(duration: string): number {
  if (!DURATION_PATTERN.test(duration)) {
    throw new Error('Invalid duration format');
  }
  const unit = duration.slice(-1) as keyof typeof SECONDS_PER_UNIT;
  return Number(duration.slice(0, -1)) * SECONDS_PER_UNIT[unit];
}
