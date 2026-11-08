import { AesSecretCipher } from './aes-secret-cipher.js';

const SECRET = 'a-test-secret-with-more-than-32-characters!!';
const API_KEY = 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';

describe('AesSecretCipher', () => {
  const cipher = new AesSecretCipher({ secret: SECRET });

  it('gives back what it hid', () => {
    expect(cipher.decrypt(cipher.encrypt(API_KEY))).toBe(API_KEY);
  });

  it('does not show the text, and says which format it is', () => {
    const encrypted = cipher.encrypt(API_KEY);

    expect(encrypted).not.toContain('sk-ant');
    expect(encrypted).not.toContain(API_KEY.slice(10, 30));
    expect(encrypted.startsWith('v1.')).toBe(true);
    expect(encrypted.split('.')).toHaveLength(4);
    // It must fit the column of the database.
    expect(encrypted.length).toBeLessThan(1024);
  });

  it('never produces the same text twice for the same key', () => {
    expect(cipher.encrypt(API_KEY)).not.toBe(cipher.encrypt(API_KEY));
  });

  it('holds text with accents and symbols', () => {
    const text = 'clave ñandú — ✓ 𝔘';
    expect(cipher.decrypt(cipher.encrypt(text))).toBe(text);
  });

  it('notices when the stored text was changed', () => {
    const [version, iv, tag, text] = cipher.encrypt(API_KEY).split('.');
    const flipped = `${text.slice(0, -2)}${text.endsWith('AA') ? 'BB' : 'AA'}`;

    expect(() =>
      cipher.decrypt([version, iv, tag, flipped].join('.')),
    ).toThrow();
  });

  it('notices when the authentication tag was changed', () => {
    const [version, iv, tag, text] = cipher.encrypt(API_KEY).split('.');
    const otherTag = Buffer.alloc(16, 1).toString('base64url');

    expect(tag).not.toBe(otherTag);
    expect(() =>
      cipher.decrypt([version, iv, otherTag, text].join('.')),
    ).toThrow();
  });

  it('cannot be read with another secret', () => {
    const other = new AesSecretCipher({ secret: `${SECRET}-rotated` });

    expect(() => other.decrypt(cipher.encrypt(API_KEY))).toThrow();
  });

  it.each([
    '',
    'sk-ant-plain-text',
    'v1.a.b',
    'v2.a.b.c',
    'v1.a.b.c.d',
    'v1....',
  ])('refuses something that it did not produce: %j', (garbage) => {
    expect(() => cipher.decrypt(garbage)).toThrow();
  });
});
