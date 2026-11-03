import type { Transaction } from '../../../../common/persistence/transaction.js';

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

export interface StoredRefreshToken {
  readonly id: number;
  readonly userId: number;
  readonly family: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface NewRefreshToken {
  readonly userId: number;
  readonly family: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface RefreshTokenRepository {
  create(token: NewRefreshToken, transaction?: Transaction): Promise<void>;
  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;
  /** When the session (family) was first signed in: the creation of its oldest token, or null if unknown. */
  findFamilyStart(family: string): Promise<Date | null>;
  /**
   * Revokes the token only if it is still active, atomically. Returns false when someone else got there
   * first, which is how two simultaneous refreshes are told apart.
   */
  revokeIfActive(
    id: number,
    now: Date,
    transaction?: Transaction,
  ): Promise<boolean>;
  revokeFamily(
    family: string,
    now: Date,
    transaction?: Transaction,
  ): Promise<void>;
  /** Ends every session of the user, except (optionally) the family of the current one. */
  revokeAllOfUser(
    userId: number,
    now: Date,
    exceptFamily: string | null,
    transaction?: Transaction,
  ): Promise<void>;
}
