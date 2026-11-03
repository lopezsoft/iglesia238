import { Signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';

/** A signal that follows `source` after the person stops typing. Call it in an injection context. */
export function debounced<T>(source: Signal<T>, milliseconds = 300): Signal<T> {
  return toSignal(toObservable(source).pipe(debounceTime(milliseconds)), {
    initialValue: source(),
  });
}
