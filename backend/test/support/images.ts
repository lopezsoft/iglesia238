// Images built from code for the tests: no binary fixture lives in the repository.

import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export interface PngOptions {
  /** Interlaced (Adam7) PNG: pdfkit cannot embed it. */
  readonly interlaced?: boolean;
  /** The header says the size but the pixels are a few bytes: for tests of the limits, which never decode. */
  readonly headerOnly?: boolean;
}

/** A real, decodable RGB PNG of the given size (a flat blue). */
export function png(
  width: number,
  height: number,
  options: PngOptions = {},
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // color type: RGB
  header[12] = options.interlaced ? 1 : 0;

  let raw: Buffer;
  if (options.headerOnly) {
    raw = Buffer.alloc(4);
  } else {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      row[1 + x * 3] = 0x1f;
      row[2 + x * 3] = 0x56;
      row[3 + x * 3] = 0xc4;
    }
    raw = Buffer.concat(Array.from({ length: height }, () => row));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * A JPEG with the headers of the given size and no scan data. It is enough to read its size and for pdfkit to embed
 * it (pdfkit copies the data as it is), but it is not a picture: never render it.
 */
export function jpeg(width: number, height: number): Buffer {
  const dimensions = Buffer.alloc(4);
  dimensions.writeUInt16BE(height, 0);
  dimensions.writeUInt16BE(width, 2);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // start of image
    Buffer.from([
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
      0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    ]), // JFIF
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]), // SOF0, length 17, 8 bits
    dimensions,
    Buffer.from([0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]),
    Buffer.from([0xff, 0xd9]), // end of image
  ]);
}

export const toBase64 = (bytes: Buffer): string => bytes.toString('base64');
