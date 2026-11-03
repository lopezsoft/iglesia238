import { generateOpaqueToken, hashOpaqueToken } from './opaque-token.js';

describe('opaque tokens', () => {
  it('generates a url-safe secret and the hash that is stored', () => {
    const { token, hash } = generateOpaqueToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashOpaqueToken(token));
    expect(hash).not.toContain(token);
  });

  it('never repeats a token', () => {
    expect(generateOpaqueToken().token).not.toBe(generateOpaqueToken().token);
  });
});
