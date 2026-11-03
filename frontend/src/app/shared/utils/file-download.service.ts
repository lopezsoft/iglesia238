import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/**
 * Hands a Blob that the API generated (PDF, CSV) to the browser as a download. The bearer token
 * makes a plain link impossible, so screens fetch the Blob with HttpClient and save it here.
 */
@Injectable({ providedIn: 'root' })
export class FileDownloadService {
  private readonly document = inject(DOCUMENT);

  save(blob: Blob, filename: string): void {
    const view = this.document.defaultView;
    if (!view) {
      return;
    }
    const url = view.URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.hidden = true;
    this.document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked on the next turn so the browser has started the download.
    view.setTimeout(() => view.URL.revokeObjectURL(url), 0);
  }
}
