import { ErrorHandler, Injectable, inject } from '@angular/core';
import { DebugService } from '../debug/debug.service';
import { VersionUpdateService } from '../version/version-update.service';

/** Uncaught errors go through DebugService, so nothing reaches the console in production. */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly debug = inject(DebugService);
  private readonly versionUpdate = inject(VersionUpdateService);

  handleError(error: unknown): void {
    if (this.versionUpdate.handlePotentialChunkError(error)) {
      return;
    }
    this.debug.error('Unhandled error', error);
  }
}
