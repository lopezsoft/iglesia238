export const AUTH_SETTINGS = Symbol('AUTH_SETTINGS');

/** Configuration the auth use cases need, resolved once from the environment. */
export interface AuthSettings {
  readonly refreshTtlSeconds: number;
  /** A session ends this long after sign-in, however many times its refresh token was rotated. */
  readonly refreshMaxLifetimeSeconds: number;
  /** Public address of the web app, without a trailing slash. Links in e-mails are built from it. */
  readonly appBaseUrl: string;
  /** The refresh cookie travels only over HTTPS (production, or any deployment whose address is https). */
  readonly cookieSecure: boolean;
}
