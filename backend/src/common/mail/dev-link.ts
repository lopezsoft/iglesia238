import type { Mailer } from './mailer.port.js';

/** Boolean provider: true outside production. Bound in FoundationModule from NODE_ENV. */
export const EXPOSE_DEV_LINKS = Symbol('EXPOSE_DEV_LINKS');

/**
 * The one-time link may be returned in the response ONLY while there is no way to mail it (the logging
 * mailer, SMTP not configured) and the environment is not production. Anywhere else it travels only by
 * e-mail. The caller must never log the link or the token.
 */
export function devLinkFor(
  mailer: Pick<Mailer, 'isConfigured'>,
  exposeDevLinks: boolean,
  link: string,
): string | undefined {
  return !mailer.isConfigured && exposeDevLinks ? link : undefined;
}
