// Reads what a PNG or a JPEG says about itself from its first bytes, without decoding a single pixel.
// The type of a file is decided by these bytes, never by the name or the type the client declared.

export interface ImageInfo {
  readonly extension: 'png' | 'jpg';
  readonly mimeType: 'image/png' | 'image/jpeg';
  readonly width: number;
  readonly height: number;
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function readPng(bytes: Buffer): ImageInfo | null {
  // Signature (8) + IHDR chunk: length (4), "IHDR" (4), width (4), height (4).
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }
  if (bytes.toString('latin1', 12, 16) !== 'IHDR') {
    return null;
  }
  return {
    extension: 'png',
    mimeType: 'image/png',
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

/** Start-of-frame markers carry the size; C4 (DHT), C8 (JPG) and CC (DAC) share the range but are not frames. */
function isStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

function readJpeg(bytes: Buffer): ImageInfo | null {
  if (
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  ) {
    return null;
  }
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      // Padding before a marker.
      offset += 1;
      continue;
    }
    // Markers without a payload: standalone (01), restart (D0-D7) and start of image (D8).
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    // End of image or start of scan before any frame header: there is no size to read.
    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) {
      return null;
    }
    if (isStartOfFrame(marker)) {
      if (offset + 9 > bytes.length) {
        return null;
      }
      return {
        extension: 'jpg',
        mimeType: 'image/jpeg',
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

/** The kind and size of a PNG or a JPEG, or null for anything else (SVG, GIF, WebP, a renamed text file...). */
export function readImageInfo(bytes: Buffer): ImageInfo | null {
  return readPng(bytes) ?? readJpeg(bytes);
}
