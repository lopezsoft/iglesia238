import { createHash, randomBytes } from 'node:crypto';

/** What every connection token starts with, so a leaked one is recognised on sight and by secret scanners. */
export const AI_TOKEN_MARKER = 'i238_mcp_';
const BODY_BYTES = 32;
/** `i238_mcp_` plus 32 random bytes in base64url (43 characters). */
const TOKEN_PATTERN = /^i238_mcp_[A-Za-z0-9_-]{43}$/;
const PREFIX_LENGTH = 14;

export interface NewAiToken {
  /** Shown to the user once; never stored. */
  readonly token: string;
  readonly hash: string;
  readonly prefix: string;
}

export function hashAiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateAiToken(): NewAiToken {
  const token = `${AI_TOKEN_MARKER}${randomBytes(BODY_BYTES).toString('base64url')}`;
  return {
    token,
    hash: hashAiToken(token),
    prefix: token.slice(0, PREFIX_LENGTH),
  };
}

/** A shape check before touching the database: whatever else arrives is not one of ours. */
export function looksLikeAiToken(candidate: string): boolean {
  return TOKEN_PATTERN.test(candidate);
}
