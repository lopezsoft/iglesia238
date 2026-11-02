import { Observable, defer, delay, of, throwError, timer, mergeMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DomainError } from '../errors/domain-error';

/**
 * Emits a deep copy of `value` after the demo latency, like an HTTP response would.
 * The copy keeps callers from mutating the in-memory database by accident.
 */
export function demoResponse<T>(value: T): Observable<T> {
  return defer(() => of(structuredClone(value))).pipe(delay(environment.demoLatencyMs));
}

/** Runs `operation` lazily after the demo latency; a thrown DomainError becomes an error. */
export function demoCommand<T>(operation: () => T): Observable<T> {
  return timer(environment.demoLatencyMs).pipe(
    mergeMap(() => {
      try {
        return of(structuredClone(operation()));
      } catch (error) {
        return throwError(() => error);
      }
    }),
  );
}

export function demoFailure(code: string, message: string): Observable<never> {
  return timer(environment.demoLatencyMs).pipe(
    mergeMap(() => throwError(() => new DomainError(code, message))),
  );
}
