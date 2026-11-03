import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Holds the short-lived access token IN MEMORY ONLY (never localStorage or sessionStorage: a
 * script injected into the page could read it). After a reload the refresh cookie, which the
 * browser keeps HttpOnly, issues a new one.
 */
@Injectable({ providedIn: 'root' })
export class AccessTokenStore {
  private current: string | null = null;
  private readonly expiredSubject = new Subject<void>();

  /** Emits when the session can no longer be renewed (refresh rejected): the app must sign out. */
  readonly expired$ = this.expiredSubject.asObservable();

  get token(): string | null {
    return this.current;
  }

  set(token: string): void {
    this.current = token;
  }

  clear(): void {
    this.current = null;
  }

  /** Clears the token and tells the app the session ended on the server side. */
  expire(): void {
    this.clear();
    this.expiredSubject.next();
  }
}
