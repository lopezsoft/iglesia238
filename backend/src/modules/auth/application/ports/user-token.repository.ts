import type { Transaction } from '../../../../common/persistence/transaction.js';

export const USER_TOKEN_REPOSITORY = Symbol('USER_TOKEN_REPOSITORY');

/** EMAIL_VERIFICATION is the invitation link; PASSWORD_RESET is the recovery link. */
export type UserTokenKind = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

export interface StoredUserToken {
  readonly id: number;
  readonly userId: number;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
}

export interface NewUserToken {
  readonly userId: number;
  readonly type: UserTokenKind;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface UserTokenRepository {
  create(token: NewUserToken, transaction?: Transaction): Promise<void>;
  findByHash(
    tokenHash: string,
    type: UserTokenKind,
  ): Promise<StoredUserToken | null>;
  /** Marks the token as used only if it still was not, atomically. False means somebody used it first. */
  consume(id: number, now: Date, transaction?: Transaction): Promise<boolean>;
  /** Marks every unused token of that kind of the user as used (a new link replaces the old ones). */
  invalidatePending(
    userId: number,
    type: UserTokenKind,
    now: Date,
    transaction?: Transaction,
  ): Promise<void>;
}
