export const SESSION_VALIDATOR = Symbol('SESSION_VALIDATOR');

/**
 * Tells whether the session an access token belongs to is still open. The access token is a signed
 * claim that lives for minutes; logging out, changing the password or detecting a stolen refresh token
 * ends the session before that, so the token alone is not enough.
 */
export interface SessionValidator {
  isActive(userId: number, sessionId: string, now: Date): Promise<boolean>;
}
