export const environment = {
  /**
   * Until the API exposes each module (Sprints 1 to 6 of the plan), repositories use in-memory
   * demo adapters with fictional data, and the shell shows a "Modo demostración" banner.
   */
  demoMode: true,
  /** Simulated network latency of the demo adapters, so loading states are visible. */
  demoLatencyMs: 250,
  apiBaseUrl: '/api',
} as const;
