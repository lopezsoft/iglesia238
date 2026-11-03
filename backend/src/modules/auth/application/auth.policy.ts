/** Sign-in policy: the numbers the frontend explains in its lockout message (auth-policy.ts). */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

/** Recovery links live for 30 minutes and work once. */
export const PASSWORD_RESET_TOKEN_MINUTES = 30;

/**
 * A refresh token that was rotated a moment ago and is presented again is almost always two tabs
 * refreshing at the same time, not a theft: inside this window it is refused without ending the session.
 */
export const REFRESH_REUSE_GRACE_SECONDS = 10;

/** Per-email limits applied by the use cases, next to the per-IP limits of the controller. */
export const LOGIN_EMAIL_RATE = { limit: 10, windowSeconds: 15 * 60 } as const;
export const PASSWORD_RESET_EMAIL_RATE = {
  limit: 5,
  windowSeconds: 60 * 60,
} as const;
export const CHANGE_PASSWORD_RATE = {
  limit: 10,
  windowSeconds: 15 * 60,
} as const;

export const AuthErrorCode = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  NO_ACTIVE_ROLES: 'NO_ACTIVE_ROLES',
  TOKEN_INVALID_OR_EXPIRED: 'TOKEN_INVALID_OR_EXPIRED',
  INVITATION_INVALID: 'INVITATION_INVALID',
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
  CSRF_HEADER_REQUIRED: 'CSRF_HEADER_REQUIRED',
} as const;

/** Audit actions written by the auth module (entity "User"). */
export const AuthAuditAction = {
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  LOGOUT: 'LOGOUT',
  REFRESH_REUSE_DETECTED: 'REFRESH_REUSE_DETECTED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  INVITATION_ACCEPTED: 'INVITATION_ACCEPTED',
} as const;

export const AUDIT_ENTITY_USER = 'User';
