import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AccessTokenStore } from './access-token.store';
import { isApiRequest, isSessionlessAuthPath } from './api-url';
import { REQUESTED_WITH, TokenRefresher } from './token-refresher';

/**
 * Authenticates API calls: sends the in-memory access token as Bearer, always with credentials
 * (the refresh cookie) and the `X-Requested-With` header. When the API answers 401 it renews the
 * token once (single-flight) and repeats the request; when the renewal is rejected the session is
 * over and the app is told to sign out. Login, recovery and invitation calls are never retried:
 * their 401 is the answer.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isApiRequest(request.url)) {
    return next(request);
  }
  const tokens = inject(AccessTokenStore);
  const refresher = inject(TokenRefresher);
  const base = request.clone({ withCredentials: true, setHeaders: { 'X-Requested-With': REQUESTED_WITH } });
  const hadSession = tokens.token !== null;

  return next(withBearer(base, tokens.token)).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isSessionlessAuthPath(request.url)) {
        return throwError(() => error);
      }
      return refresher.refresh(next).pipe(
        catchError((refreshError: unknown) => {
          if (hadSession || tokens.token !== null) {
            tokens.expire();
          }
          return throwError(() => (refreshError instanceof HttpErrorResponse ? error : refreshError));
        }),
        switchMap((token) => next(withBearer(base, token))),
      );
    }),
  );
};

function withBearer(request: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
}
