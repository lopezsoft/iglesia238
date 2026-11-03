import type { Transaction } from '../../../../common/persistence/transaction.js';

export const AUTH_ACCOUNT_REPOSITORY = Symbol('AUTH_ACCOUNT_REPOSITORY');

/** The part of a user the sign-in flows need. */
export interface AuthAccount {
  readonly id: number;
  readonly email: string;
  readonly displayName: string | null;
  readonly passwordHash: string;
  readonly isActive: boolean;
  readonly emailVerifiedAt: Date | null;
  readonly lockedUntil: Date | null;
}

export interface FailedLoginResult {
  /** True when this failure reached the limit and locked the account. */
  readonly locked: boolean;
  readonly lockedUntil: Date | null;
}

/** Access to users for authentication. Users are global (not tenant data), so no TenantScope here. */
export interface AuthAccountRepository {
  /** Email must already be normalized (trimmed, lower case). Deleted users are never returned. */
  findByEmail(email: string): Promise<AuthAccount | null>;
  findById(id: number): Promise<AuthAccount | null>;
  /** Counts a failed attempt; at `maxAttempts` locks the account for `lockMinutes` and restarts the count. */
  registerFailedLogin(
    userId: number,
    now: Date,
    policy: { maxAttempts: number; lockMinutes: number },
    transaction?: Transaction,
  ): Promise<FailedLoginResult>;
  /** Clears the failure count and the lock, stamps lastLoginAt and, when given, stores an upgraded hash. */
  registerSuccessfulLogin(
    userId: number,
    now: Date,
    upgradedPasswordHash: string | null,
    transaction?: Transaction,
  ): Promise<void>;
  /** Stamps the confirmation of the mailbox. A date that is already set is never moved. */
  markEmailVerified(
    userId: number,
    verifiedAt: Date,
    transaction?: Transaction,
  ): Promise<void>;
  /** Stores a new password and clears the failure count and the lock. Optionally verifies the e-mail. */
  setPassword(
    userId: number,
    passwordHash: string,
    options: { verifyEmailAt: Date | null },
    transaction?: Transaction,
  ): Promise<void>;
}
