import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

export interface OpaqueToken {
  /** The secret that travels to the person (cookie, link). Never stored and never logged. */
  readonly token: string;
  /** What is stored: SHA-256 in hex (64 characters). A leaked table cannot be used as tokens. */
  readonly hash: string;
}

/** SHA-256 hex of a token, the form stored in refresh_tokens.token_hash and user_tokens.token_hash. */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 32 random bytes in base64url: refresh tokens, invitation links and recovery links. */
export function generateOpaqueToken(): OpaqueToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, hash: hashOpaqueToken(token) };
}
