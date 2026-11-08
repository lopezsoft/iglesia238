import { InvalidInputException } from '../../../common/errors/domain.exception.js';
import { jpeg, png, toBase64 } from '../../../../test/support/images.js';
import { BrandingErrorCode } from './branding-errors.js';
import {
  LOGO_FILE_NAME,
  LOGO_MAX_BASE64_LENGTH,
  LOGO_MAX_BYTES,
  MIN_COLOR_CONTRAST,
  acceptColor,
  acceptLogo,
  contrastWithWhite,
  logoKey,
} from './branding-rules.js';

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidInputException);
    return (error as { code: string }).code;
  }
  throw new Error('Expected the call to be rejected');
}

describe('acceptLogo', () => {
  it('accepts a PNG and a JPEG and describes them', () => {
    const accepted = acceptLogo(toBase64(png(200, 100)));
    expect(accepted.info).toMatchObject({
      extension: 'png',
      width: 200,
      height: 100,
    });
    expect(accepted.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(accepted.bytes.equals(png(200, 100))).toBe(true);

    expect(acceptLogo(toBase64(jpeg(300, 300))).info.extension).toBe('jpg');
  });

  it('names the file from its content: the same logo always gets the same key', () => {
    const first = acceptLogo(toBase64(png(64, 64)));
    const again = acceptLogo(toBase64(png(64, 64)));
    const other = acceptLogo(toBase64(png(65, 64)));

    expect(logoKey(7, first)).toBe(logoKey(7, again));
    expect(logoKey(7, first)).not.toBe(logoKey(7, other));
    expect(logoKey(7, first)).toMatch(/^branding\/7\/logo-[0-9a-f]{16}\.png$/);
    expect(logoKey(7, first).split('/')[2]).toMatch(LOGO_FILE_NAME);
  });

  it('rejects an empty or missing body', () => {
    for (const value of ['', undefined, null, 42, {}]) {
      expect(codeOf(() => acceptLogo(value))).toBe(
        BrandingErrorCode.LOGO_INVALID,
      );
    }
  });

  it('rejects a data URL: the client must send only the base64', () => {
    const dataUrl = `data:image/png;base64,${toBase64(png(64, 64))}`;

    expect(codeOf(() => acceptLogo(dataUrl))).toBe(
      BrandingErrorCode.LOGO_INVALID,
    );
  });

  it.each([
    ['whitespace', ' abcd'],
    ['a line break', 'abcd\nabcd'],
    ['characters outside the alphabet', 'ab$d'],
    ['a length that is not a multiple of 4', 'abcde'],
    ['misplaced padding', 'ab=d'],
  ])('rejects base64 with %s', (_name, text) => {
    expect(codeOf(() => acceptLogo(text))).toBe(BrandingErrorCode.LOGO_INVALID);
  });

  it('rejects a text that is too long without decoding it', () => {
    const huge = 'A'.repeat(LOGO_MAX_BASE64_LENGTH + 4);

    expect(codeOf(() => acceptLogo(huge))).toBe(
      BrandingErrorCode.LOGO_TOO_LARGE,
    );
  });

  it('rejects a file over the limit even when its text fits', () => {
    // Pads a valid PNG so its decoded size is just over 512 KB, with a base64 text of exactly the allowed length.
    const padded = Buffer.concat([png(64, 64), Buffer.alloc(LOGO_MAX_BYTES)]);

    expect(codeOf(() => acceptLogo(toBase64(padded)))).toBe(
      BrandingErrorCode.LOGO_TOO_LARGE,
    );
  });

  it('accepts a file just under the limit', () => {
    const padded = Buffer.concat([
      png(64, 64),
      Buffer.alloc(LOGO_MAX_BYTES - 2000),
    ]);

    expect(() => acceptLogo(toBase64(padded))).not.toThrow();
  });

  it.each([
    [
      'an SVG',
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>',
      ),
    ],
    ['a GIF', Buffer.from('GIF89a\x40\x00\x40\x00;', 'latin1')],
    ['text', Buffer.from('not an image, whatever the extension says')],
  ])('rejects %s by its bytes', (_name, bytes) => {
    expect(codeOf(() => acceptLogo(toBase64(bytes)))).toBe(
      BrandingErrorCode.LOGO_FORMAT_UNSUPPORTED,
    );
  });

  it.each([
    [31, 64],
    [64, 31],
    [2001, 64],
    [64, 2001],
  ])('rejects a %i x %i image', (width, height) => {
    const file = png(width, height, { headerOnly: true });

    expect(codeOf(() => acceptLogo(toBase64(file)))).toBe(
      BrandingErrorCode.LOGO_DIMENSIONS_INVALID,
    );
  });

  it('accepts the limits of the size', () => {
    expect(() => acceptLogo(toBase64(png(32, 32)))).not.toThrow();
    expect(() =>
      acceptLogo(toBase64(png(2000, 32, { headerOnly: true }))),
    ).not.toThrow();
  });
});

describe('contrastWithWhite', () => {
  it('is 21 for black and 1 for white', () => {
    expect(contrastWithWhite('#000000')).toBeCloseTo(21, 0);
    expect(contrastWithWhite('#ffffff')).toBeCloseTo(1, 5);
  });

  it('matches the known value of the default blue of the system', () => {
    expect(contrastWithWhite('#1f56c4')).toBeGreaterThan(MIN_COLOR_CONTRAST);
  });
});

describe('acceptColor', () => {
  it('stores a valid color in lowercase', () => {
    expect(acceptColor('#1F56C4')).toBe('#1f56c4');
    expect(acceptColor('  #0B3D2E ')).toBe('#0b3d2e');
  });

  it('answers null for blank, null or missing: the default color of the system', () => {
    expect(acceptColor('')).toBeNull();
    expect(acceptColor('   ')).toBeNull();
    expect(acceptColor(null)).toBeNull();
    expect(acceptColor(undefined)).toBeNull();
  });

  it.each([
    '1f56c4',
    '#1f56c',
    '#1f56c44',
    '#gggggg',
    'blue',
    'rgb(1,2,3)',
    '#1f56c4;',
  ])('rejects %s', (value) => {
    expect(codeOf(() => acceptColor(value))).toBe(
      BrandingErrorCode.COLOR_INVALID,
    );
  });

  it('rejects what is not a string', () => {
    expect(codeOf(() => acceptColor(123))).toBe(
      BrandingErrorCode.COLOR_INVALID,
    );
  });

  it('rejects a color too light for the text of the documents, and says how much contrast it has', () => {
    for (const light of ['#ffffff', '#ffff00', '#cccccc', '#f0e68c']) {
      expect(codeOf(() => acceptColor(light))).toBe(
        BrandingErrorCode.COLOR_LOW_CONTRAST,
      );
    }
    try {
      acceptColor('#ffff00');
    } catch (error) {
      expect((error as Error).message).toContain('1.1:1');
      expect((error as Error).message).toContain('4.5:1');
    }
  });

  it('accepts dark colors, however saturated', () => {
    for (const dark of ['#000000', '#8b0000', '#006400', '#4b0082']) {
      expect(() => acceptColor(dark)).not.toThrow();
    }
  });
});
