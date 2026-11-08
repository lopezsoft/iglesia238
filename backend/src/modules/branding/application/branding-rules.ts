// Pure rules of the visual identity of a denomination: what a logo and a color must be to be accepted.

import { createHash } from 'node:crypto';
import {
  colorInvalid,
  colorLowContrast,
  logoDimensionsInvalid,
  logoFormatUnsupported,
  logoInvalid,
  logoTooLarge,
} from './branding-errors.js';
import { readImageInfo, type ImageInfo } from './image-info.js';

/** A letterhead logo does not need more; it also keeps the JSON body under the global limit of the API. */
export const LOGO_MAX_BYTES = 512 * 1024;
/** Length of the base64 text of the largest accepted file. Checked before decoding, so a huge body is never decoded. */
export const LOGO_MAX_BASE64_LENGTH = Math.ceil(LOGO_MAX_BYTES / 3) * 4;
export const LOGO_MIN_DIMENSION = 32;
export const LOGO_MAX_DIMENSION = 2000;
/** The color of the documents until the denomination chooses one (the blue of the system). */
export const DEFAULT_PRIMARY_COLOR = '#1f56c4';
/** WCAG AA for normal text: what the documents print over (or in) the color. */
export const MIN_COLOR_CONTRAST = 4.5;

const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export interface AcceptedLogo {
  readonly bytes: Buffer;
  readonly info: ImageInfo;
  /** First 16 hex characters of the SHA-256 of the content: names the file and changes the URL when the logo does. */
  readonly hash: string;
}

/** Key of a logo in the storage. The name comes from the content, never from the user. */
export function logoKey(
  denominationId: number,
  logo: Pick<AcceptedLogo, 'hash' | 'info'>,
): string {
  return `branding/${denominationId}/logo-${logo.hash}.${logo.info.extension}`;
}

/** The only file names the public route serves: `logo-<16 hex>.png|jpg`. */
export const LOGO_FILE_NAME = /^logo-[0-9a-f]{16}\.(?:png|jpg)$/;

/**
 * Validates a logo that arrives as base64 text and returns its bytes. It rejects what is not strictly base64 (also a
 * `data:` URL, which the client must strip), what is too big, what is not a PNG or a JPEG by its bytes, and sizes
 * outside the limits.
 */
export function acceptLogo(contentBase64: unknown): AcceptedLogo {
  if (typeof contentBase64 !== 'string' || contentBase64.length === 0) {
    throw logoInvalid('Falta el contenido del logo en base64.');
  }
  if (contentBase64.startsWith('data:')) {
    throw logoInvalid(
      'Envía solo el contenido en base64, sin el prefijo «data:image/...;base64,».',
    );
  }
  if (contentBase64.length > LOGO_MAX_BASE64_LENGTH) {
    throw logoTooLarge(LOGO_MAX_BYTES / 1024);
  }
  if (!BASE64.test(contentBase64)) {
    throw logoInvalid('El contenido del logo no es base64 válido.');
  }
  const bytes = Buffer.from(contentBase64, 'base64');
  // Rejects padding bits that decode to the same bytes in more than one way.
  if (bytes.toString('base64') !== contentBase64) {
    throw logoInvalid('El contenido del logo no es base64 válido.');
  }
  if (bytes.length > LOGO_MAX_BYTES) {
    throw logoTooLarge(LOGO_MAX_BYTES / 1024);
  }
  const info = readImageInfo(bytes);
  if (!info) {
    throw logoFormatUnsupported();
  }
  const sides = [info.width, info.height];
  if (
    sides.some((side) => side < LOGO_MIN_DIMENSION || side > LOGO_MAX_DIMENSION)
  ) {
    throw logoDimensionsInvalid(LOGO_MIN_DIMENSION, LOGO_MAX_DIMENSION);
  }
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  return { bytes, info, hash };
}

/** WCAG relative luminance of a #RRGGBB color. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Contrast of a #RRGGBB color against white (1 to 21). */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/**
 * A color for the documents: `#RRGGBB`, stored in lowercase, dark enough for text on white. Blank (or null) means
 * "use the default color of the system" and answers null.
 */
export function acceptColor(input: unknown): string | null {
  if (input === null || input === undefined) {
    return null;
  }
  if (typeof input !== 'string') {
    throw colorInvalid();
  }
  const text = input.trim();
  if (text === '') {
    return null;
  }
  if (!HEX_COLOR.test(text)) {
    throw colorInvalid();
  }
  const color = text.toLowerCase();
  const ratio = contrastWithWhite(color);
  if (ratio < MIN_COLOR_CONTRAST) {
    throw colorLowContrast(ratio, MIN_COLOR_CONTRAST);
  }
  return color;
}
