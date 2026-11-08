import { jpeg, png } from '../../../../test/support/images.js';
import { PdfkitLogoProbe } from './pdfkit-logo.probe.js';

describe('PdfkitLogoProbe', () => {
  const probe = new PdfkitLogoProbe();

  it('accepts a PNG and a JPEG that can be placed in a PDF', async () => {
    await expect(probe.canEmbed(png(120, 60))).resolves.toBe(true);
    await expect(probe.canEmbed(jpeg(200, 100))).resolves.toBe(true);
  });

  it('rejects what pdfkit cannot open, without throwing', async () => {
    await expect(probe.canEmbed(Buffer.from('not an image'))).resolves.toBe(
      false,
    );
    await expect(probe.canEmbed(Buffer.alloc(0))).resolves.toBe(false);
    await expect(probe.canEmbed(png(64, 64).subarray(0, 40))).resolves.toBe(
      false,
    );
  });

  it('survives a PNG with a valid header and corrupt data, which makes png-js throw from a callback', async () => {
    // The header says "interlaced" but the data is not: png-js then throws "Invalid filter algorithm" from inside a
    // zlib callback. In the main thread that is an uncaught exception that would end the process (and this test run).
    const corrupt = png(64, 64, { interlaced: true });

    await expect(probe.canEmbed(corrupt)).resolves.toBe(false);
    // The process is still here, and the probe still works.
    await expect(probe.canEmbed(png(64, 64))).resolves.toBe(true);
  });

  it('answers each file on its own when several arrive together', async () => {
    const answers = await Promise.all([
      probe.canEmbed(png(64, 64)),
      probe.canEmbed(png(64, 64, { interlaced: true })),
      probe.canEmbed(jpeg(100, 100)),
      probe.canEmbed(Buffer.from('nope')),
    ]);

    expect(answers).toEqual([true, false, true, false]);
  });
});
