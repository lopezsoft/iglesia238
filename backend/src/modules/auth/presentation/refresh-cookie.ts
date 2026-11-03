import type { FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenDomainException } from '../../../common/errors/domain.exception.js';
import { AuthErrorCode } from '../application/auth.policy.js';

export const REFRESH_COOKIE_NAME = 'refresh_token';

/** The cookie is only sent to the auth endpoints, never to the rest of the API. */
export const REFRESH_COOKIE_PATH = '/api/auth';

export function readRefreshCookie(request: FastifyRequest): string | undefined {
  const value = request.cookies?.[REFRESH_COOKIE_NAME];
  return value ? value : undefined;
}

export function writeRefreshCookie(
  reply: FastifyReply,
  token: string,
  options: { maxAgeSeconds: number; secure: boolean },
): void {
  void reply.setCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: options.secure,
    path: REFRESH_COOKIE_PATH,
    maxAge: options.maxAgeSeconds,
  });
}

export function clearRefreshCookie(
  reply: FastifyReply,
  options: { secure: boolean },
): void {
  void reply.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'strict',
    secure: options.secure,
    path: REFRESH_COOKIE_PATH,
  });
}

/**
 * Endpoints that act on the cookie need a header that a plain cross-site form post cannot send
 * (browsers only allow a custom header after a CORS preflight that this API does not grant).
 */
export function requireRequestedWith(request: FastifyRequest): void {
  const header = request.headers['x-requested-with'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    throw new ForbiddenDomainException(
      'Solicitud no permitida.',
      AuthErrorCode.CSRF_HEADER_REQUIRED,
    );
  }
}
