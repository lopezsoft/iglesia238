import {
  AI_TOKEN_MARKER,
  generateAiToken,
  hashAiToken,
  looksLikeAiToken,
} from './ai-access-token.js';

describe('connection tokens', () => {
  it('start with a marker, are long and use only characters that fit in a header', () => {
    const { token } = generateAiToken();

    expect(token.startsWith(AI_TOKEN_MARKER)).toBe(true);
    expect(token).toMatch(/^i238_mcp_[A-Za-z0-9_-]{43}$/);
  });

  it('are different every time', () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => generateAiToken().token),
    );

    expect(tokens.size).toBe(50);
  });

  it('are stored as a hash that the token reproduces, and the hash does not contain the token', () => {
    const { token, hash } = generateAiToken();

    expect(hash).toBe(hashAiToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token.slice(10, 30));
    expect(hashAiToken(`${token}x`)).not.toBe(hash);
  });

  it('keep a short prefix to recognise them in a list, never the whole thing', () => {
    const { token, prefix } = generateAiToken();

    expect(prefix).toBe(token.slice(0, 14));
    expect(prefix.length).toBeLessThan(token.length / 2);
  });

  it('are recognised by their shape before the database is asked', () => {
    expect(looksLikeAiToken(generateAiToken().token)).toBe(true);
    expect(looksLikeAiToken('')).toBe(false);
    expect(looksLikeAiToken('i238_mcp_short')).toBe(false);
    expect(looksLikeAiToken('Bearer abc')).toBe(false);
    expect(looksLikeAiToken(`${generateAiToken().token} `)).toBe(false);
    expect(looksLikeAiToken(`x${generateAiToken().token}`)).toBe(false);
  });
});
