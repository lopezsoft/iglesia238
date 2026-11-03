/** Port implemented by the infrastructure: the health module knows no concrete technology. */
export interface HealthIndicator {
  readonly name: string;
  /** Rejects when the dependency is unavailable. */
  check(): Promise<void>;
}

export const HEALTH_INDICATORS = Symbol('HEALTH_INDICATORS');
