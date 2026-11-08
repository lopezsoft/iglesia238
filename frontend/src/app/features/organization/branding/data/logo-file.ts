import { Branding } from './branding.models';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg'];

/**
 * What is wrong with the file the person picked, or null. A courtesy that saves a round trip: the server checks the
 * bytes again (type, size and dimensions).
 */
export function logoFileProblem(
  file: { readonly type: string; readonly size: number },
  limits: Branding['limits'],
): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'El logo debe ser una imagen PNG o JPEG.';
  }
  if (file.size > limits.logoMaxBytes) {
    return `El logo pesa demasiado: máximo ${Math.round(limits.logoMaxBytes / 1024)} KB.`;
  }
  return null;
}

/** The raw base64 of a file, without the `data:` prefix: what the API expects. */
export async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunk = 0x8000;
  let binary = '';
  for (let start = 0; start < bytes.length; start += chunk) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunk));
  }
  return btoa(binary);
}
