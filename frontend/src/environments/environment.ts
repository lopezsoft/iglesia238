export const environment = {
  /** Base path of the REST API (the dev server proxies it to the backend; same origin in production). */
  apiBaseUrl: '/api',
  /** Shown in the footer and the login screen; keep in sync with frontend/package.json. */
  appVersion: '0.18.0',
} as const;
