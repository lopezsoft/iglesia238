import { Branding } from './branding.models';
import { fileToBase64, logoFileProblem } from './logo-file';

const limits: Branding['limits'] = {
  logoMaxBytes: 512 * 1024,
  logoMinDimension: 32,
  logoMaxDimension: 2000,
  minContrast: 4.5,
};

describe('logoFileProblem', () => {
  it('accepts a PNG or a JPEG within the size limit, including one exactly at the limit', () => {
    expect(logoFileProblem({ type: 'image/png', size: 1000 }, limits)).toBeNull();
    expect(logoFileProblem({ type: 'image/jpeg', size: limits.logoMaxBytes }, limits)).toBeNull();
  });

  it.each(['image/svg+xml', 'image/gif', 'image/webp', 'application/pdf', ''])(
    'rejects the type %j',
    (type) => {
      expect(logoFileProblem({ type, size: 1000 }, limits)).toContain('PNG o JPEG');
    },
  );

  it('rejects a file over the limit and says the limit in KB', () => {
    const message = logoFileProblem({ type: 'image/png', size: limits.logoMaxBytes + 1 }, limits);

    expect(message).toContain('512 KB');
  });
});

describe('fileToBase64', () => {
  it('gives the raw base64 of the file, with no data: prefix', async () => {
    const blob = { arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer) } as Blob;

    await expect(fileToBase64(blob)).resolves.toBe('AQID');
  });

  it('handles a file larger than one chunk without running out of call stack', async () => {
    const bytes = new Uint8Array(300_000).fill(255);
    const blob = { arrayBuffer: () => Promise.resolve(bytes.buffer) } as Blob;

    const base64 = await fileToBase64(blob);

    expect(atob(base64).length).toBe(300_000);
  });
});
