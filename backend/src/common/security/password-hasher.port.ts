export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

/**
 * Stored in users.password_hash for an account that cannot sign in yet (an invited user who has not
 * chosen a password). No hasher can ever produce it, so verify() always rejects it.
 */
export const UNUSABLE_PASSWORD_HASH = '!';

/** Port for password hashing, so the algorithm can change without touching the use cases. */
export interface PasswordHasher {
  /** Returns a self-describing hash string (algorithm, cost and salt included). */
  hash(plain: string): Promise<string>;
  /**
   * Checks a password. With a null hash (unknown user) it still does the work of a real check, so the
   * response time does not reveal whether the account exists.
   */
  verify(plain: string, storedHash: string | null): Promise<boolean>;
  /** True when the hash was made with weaker parameters than the current ones: rehash on login. */
  needsRehash(storedHash: string): boolean;
}
