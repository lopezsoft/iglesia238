import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { scopeHeader } from '../auth/session.model';
import { isApiRequest, isScopedPath } from './api-url';

/**
 * Tells the API where the user is acting (`X-Scope`: `P`, `D:<id>` or `C:<id>`). The API never
 * trusts it: it validates the value against the user's active roles on every request.
 */
export const scopeInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isApiRequest(request.url) || !isScopedPath(request.url) || request.headers.has('X-Scope')) {
    return next(request);
  }
  const scope = inject(AuthService).activeScope();
  return next(scope ? request.clone({ setHeaders: { 'X-Scope': scopeHeader(scope) } }) : request);
};
