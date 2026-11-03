import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { catchError, from, Observable, of, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { EMAIL_NOT_VERIFIED_CODE } from '../errors/domain-error';
import { isApiRequest, isScopedPath } from './api-url';
import { toDomainError } from './domain-error.mapper';

/**
 * Outermost interceptor: every API failure reaches the screens as a DomainError. A domain call
 * refused with EMAIL_NOT_VERIFIED also tells the session to lock the app on the "Confirma tu correo" page.
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isApiRequest(request.url)) {
    return next(request);
  }
  // Resolved on demand: AuthService depends on HttpClient, which is built with this interceptor.
  const injector = inject(Injector);
  return next(request).pipe(
    catchError((error: unknown) =>
      error instanceof HttpErrorResponse
        ? withReadableBody(error).pipe(
            switchMap((readable) => {
              const domainError = toDomainError(readable);
              if (domainError.code === EMAIL_NOT_VERIFIED_CODE && isScopedPath(request.url)) {
                void injector.get(AuthService).handleEmailNotVerified();
              }
              return throwError(() => domainError);
            }),
          )
        : throwError(() => error),
    ),
  );
};

/**
 * A failed download (`responseType: 'blob'`) arrives with its JSON body as a Blob. Decode it so the
 * server's `code` and message survive; any other failure is returned untouched, synchronously.
 */
function withReadableBody(error: HttpErrorResponse): Observable<HttpErrorResponse> {
  if (!(error.error instanceof Blob)) {
    return of(error);
  }
  return from(readJson(error.error)).pipe(
    switchMap((body) =>
      of(
        new HttpErrorResponse({
          error: body,
          headers: error.headers,
          status: error.status,
          statusText: error.statusText,
          url: error.url ?? undefined,
        }),
      ),
    ),
  );
}

/** The parsed JSON, or null when the blob is not JSON (an empty body, a proxy error page). */
async function readJson(blob: Blob): Promise<unknown> {
  try {
    const text = typeof blob.text === 'function' ? await blob.text() : await readWithFileReader(blob);
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function readWithFileReader(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
