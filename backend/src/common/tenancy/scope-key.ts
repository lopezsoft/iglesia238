import {
  ErrorCode,
  InvalidInputException,
} from '../errors/domain.exception.js';

export type ScopeKind = 'PLATFORM' | 'DENOMINATION' | 'CONGREGATION';

export interface ParsedScope {
  readonly kind: ScopeKind;
  readonly scopeKey: string;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
}

/** Header the frontend sends on every domain request, with the format of UserRole.scopeKey. */
export const SCOPE_HEADER = 'x-scope';

export const PLATFORM_SCOPE_KEY = 'P';

// Ids are positive integers without leading zeros, so each scope has exactly one spelling.
const SCOPE_KEY = /^(?:(P)|D:([1-9]\d{0,9})|C:([1-9]\d{0,9}))$/;
const MAX_INT = 2_147_483_647;

export function formatScopeKey(
  kind: ScopeKind,
  id: number | null = null,
): string {
  switch (kind) {
    case 'PLATFORM':
      return PLATFORM_SCOPE_KEY;
    case 'DENOMINATION':
      return `D:${id}`;
    case 'CONGREGATION':
      return `C:${id}`;
  }
}

/** Parses "P", "D:<id>" or "C:<id>". Anything else is a malformed header (400). */
export function parseScopeKey(raw: string): ParsedScope {
  const match = SCOPE_KEY.exec(raw);
  const id = Number(match?.[2] ?? match?.[3]);
  if (!match || id > MAX_INT) {
    throw new InvalidInputException(
      'El alcance indicado no es válido.',
      ErrorCode.SCOPE_INVALID,
    );
  }

  if (match[1]) {
    return {
      kind: 'PLATFORM',
      scopeKey: PLATFORM_SCOPE_KEY,
      denominationId: null,
      congregationId: null,
    };
  }
  if (match[2]) {
    return {
      kind: 'DENOMINATION',
      scopeKey: raw,
      denominationId: id,
      congregationId: null,
    };
  }
  return {
    kind: 'CONGREGATION',
    scopeKey: raw,
    denominationId: null,
    congregationId: id,
  };
}
