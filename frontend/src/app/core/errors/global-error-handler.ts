import { ErrorHandler, Injectable, inject } from '@angular/core';
import { DebugService } from '../debug/debug.service';

/** Uncaught errors go through DebugService, so nothing reaches the console in production. */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly debug = inject(DebugService);

  handleError(error: unknown): void {
    this.debug.error('Unhandled error', error);
  }
}
