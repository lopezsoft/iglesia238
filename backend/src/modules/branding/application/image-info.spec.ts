import { jpeg, png } from '../../../../test/support/images.js';
import { readImageInfo } from './image-info.js';

describe('readImageInfo', () => {
  it('reads the size of a PNG from its header', () => {
    expect(readImageInfo(png(120, 80))).toEqual({
      extension: 'png',
      mimeType: 'image/png',
      width: 120,
      height: 80,
    });
  });

  it('reads the size of a JPEG from its frame header', () => {
    expect(readImageInfo(jpeg(300, 150))).toEqual({
      extension: 'jpg',
      mimeType: 'image/jpeg',
      width: 300,
      height: 150,
    });
  });

  it('skips the other segments of a JPEG until it finds the frame', () => {
    const bytes = jpeg(640, 480);
    // A comment segment (FFFE) before the JFIF one: the reader must walk over it.
    const comment = Buffer.from([
      0xff, 0xfe, 0x00, 0x06, 0x68, 0x6f, 0x6c, 0x61,
    ]);
    const withComment = Buffer.concat([
      bytes.subarray(0, 2),
      comment,
      bytes.subarray(2),
    ]);

    expect(readImageInfo(withComment)).toMatchObject({
      width: 640,
      height: 480,
    });
  });

  it.each([
    [
      'an SVG',
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"></svg>',
      ),
    ],
    ['a GIF', Buffer.from('GIF89a\x40\x00\x40\x00', 'latin1')],
    [
      'plain text renamed as an image',
      Buffer.from('this is not an image at all, sorry'),
    ],
    ['an empty file', Buffer.alloc(0)],
    ['a PNG cut after the signature', png(64, 64).subarray(0, 12)],
    ['a JPEG cut before the frame', jpeg(64, 64).subarray(0, 8)],
    [
      'a PNG whose first chunk is not IHDR',
      Buffer.concat([
        png(64, 64).subarray(0, 12),
        Buffer.from('IDAT'),
        Buffer.alloc(20),
      ]),
    ],
  ])('rejects %s', (_name, bytes) => {
    expect(readImageInfo(bytes)).toBeNull();
  });

  it('does not run past the end of a malformed JPEG', () => {
    // Claims a segment of 65 KB that is not there.
    const broken = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0x00, 0x00,
    ]);

    expect(readImageInfo(broken)).toBeNull();
  });
});
