import { HttpHandlerFn, HttpHeaders, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, finalize, map, shareReplay, take } from 'rxjs';
import { AccessTokenStore } from './access-token.store';
import { apiUrl } from './api-url';

/** Value of the mandatory `X-Requested-With` header: a plain form post from another site cannot set it. */
export const REQUESTED_WITH = 'XMLHttpRequest';

/**
 * Renews the access token with the refresh cookie. Single-flight: while a refresh is running,
 * every request that failed with 401 waits for that same refresh instead of starting its own
 * (the API rotates the refresh token on each use, so two parallel refreshes would revoke it).
 */
@Injectable({ providedIn: 'root' })
export class TokenRefresher {
  private readonly tokens = inject(AccessTokenStore);
  private inFlight: Observable<string> | null = null;

  /** Emits the new access token (already stored) or errors with the raw HttpErrorResponse. */
  refresh(next: HttpHandlerFn): Observable<string> {
    this.inFlight ??= next(
      new HttpRequest<null>('POST', apiUrl('/auth/refresh'), null, {
        withCredentials: true,
        headers: new HttpHeaders({ 'X-Requested-With': REQUESTED_WITH }),
      }),
    ).pipe(
      filter((event): event is HttpResponse<{ accessToken: string }> => event instanceof HttpResponse),
      take(1),
      map((response) => {
        const accessToken = response.body?.accessToken;
        if (!accessToken) {
          throw new Error('The refresh response carries no access token.');
        }
        this.tokens.set(accessToken);
        return accessToken;
      }),
      finalize(() => (this.inFlight = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.inFlight;
  }
}
