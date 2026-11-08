import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { Injectable } from '@nestjs/common';
import type { LogoEmbeddingProbe } from '../application/ports/branding.ports.js';

/** How long a picture gets to be placed in a PDF before it is given up on. */
const PROBE_TIMEOUT_MS = 10_000;
/** A decoded 2000x2000 picture needs far less than this: the cap only stops a runaway decode. */
const WORKER_MEMORY_MB = 256;

/**
 * Runs in the worker. It places the picture in a throwaway PDF, exactly as the documents do.
 *
 * This is not run in the main thread on purpose: png-js (inside pdfkit) throws from a zlib callback when a PNG has a
 * valid header and corrupt data, which no try/catch can reach. In the main thread that is an uncaught exception that
 * takes the whole API down; in a worker it only ends the worker, and the probe answers false.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
try {
  const PDFDocument = require(workerData.pdfkitPath);
  const doc = new PDFDocument({ margin: 0 });
  doc.on('data', () => undefined);
  doc.on('end', () => parentPort.postMessage(true));
  doc.on('error', () => parentPort.postMessage(false));
  doc.image(Buffer.from(workerData.bytes), 0, 0, { fit: [32, 32] });
  doc.end();
} catch {
  parentPort.postMessage(false);
}
`;

/**
 * Tells whether pdfkit can place the picture in a PDF, in an isolated worker so that a hostile or corrupt file can
 * never crash the API. The documents embed the very same bytes later, and the file never changes (its name is its
 * hash), so what works here works there.
 */
@Injectable()
export class PdfkitLogoProbe implements LogoEmbeddingProbe {
  private readonly pdfkitPath = createRequire(import.meta.url).resolve(
    'pdfkit',
  );

  canEmbed(bytes: Buffer): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: { pdfkitPath: this.pdfkitPath, bytes },
        resourceLimits: { maxOldGenerationSizeMb: WORKER_MEMORY_MB },
      });
      const finish = (embeddable: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(embeddable);
        void worker.terminate();
      };
      const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
      worker.once('message', (embeddable: unknown) =>
        finish(embeddable === true),
      );
      worker.once('error', () => finish(false));
      worker.once('exit', () => finish(false));
    });
  }
}
