import { environment } from '../../../environments/environment';

/** Absolute path of an API endpoint: `apiUrl('/auth/login')` => `/api/auth/login`. */
export function apiUrl(path: string): string {
  return `${environment.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

/** True for requests to this app's API (the interceptors leave every other URL alone). */
export function isApiRequest(url: string): boolean {
  return url.startsWith(`${environment.apiBaseUrl}/`);
}

/** Path below the API base, without the query string: `/auth/login`. */
export function apiPath(url: string): string {
  const path = url.slice(environment.apiBaseUrl.length);
  const query = path.indexOf('?');
  return query === -1 ? path : path.slice(0, query);
}

/** Endpoints a person uses without a session: a 401 there is an answer, never a reason to refresh. */
const SESSIONLESS_AUTH = /^\/auth\/(login|refresh|logout|password-reset|invitations)(\/|$)/;

export function isSessionlessAuthPath(url: string): boolean {
  return SESSIONLESS_AUTH.test(apiPath(url));
}

/** Requests that act on a scope carry `X-Scope`; auth, public and health endpoints do not. */
export function isScopedPath(url: string): boolean {
  return !/^\/(auth|public|health)(\/|$)/.test(apiPath(url));
}
