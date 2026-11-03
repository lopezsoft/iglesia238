export const DEFAULT_AFTER_LOGIN_URL = '/dashboard';

/**
 * Returns `candidate` only when it is a path inside this app, so a crafted
 * `?returnUrl=//evil.example` or `https://…` cannot send the user to another site after login.
 */
export function safeReturnUrl(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith('/')) {
    return DEFAULT_AFTER_LOGIN_URL;
  }
  // "//host" and "/\host" are protocol-relative URLs for browsers.
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) {
    return DEFAULT_AFTER_LOGIN_URL;
  }
  // Control characters (tabs, new lines) are stripped by URL parsers and can hide "//".
  if (/[\u0000-\u001f\u007f]/.test(candidate)) {
    return DEFAULT_AFTER_LOGIN_URL;
  }
  if (candidate === '/login' || candidate.startsWith('/login/') || candidate.startsWith('/login?')) {
    return DEFAULT_AFTER_LOGIN_URL;
  }
  return candidate;
}
