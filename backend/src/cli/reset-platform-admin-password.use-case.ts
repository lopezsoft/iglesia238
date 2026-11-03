import type { PasswordHasher } from '../common/security/password-hasher.port.js';
import { findPasswordProblem } from '../common/security/password-policy.js';
import {
  CliInputError,
  normalizeEmail,
} from './create-platform-admin.use-case.js';

/** Persistence needed by the command. */
export interface PlatformPasswordStore {
  /** The id of the active platform administrator with that e-mail, or null. */
  findPlatformAdminId(email: string): Promise<number | null>;
  /**
   * Replaces the password, clears the failed attempts and the lock, and ends every open session of the
   * account, all in one transaction.
   */
  replacePassword(userId: number, passwordHash: string): Promise<void>;
}

export interface ResetPlatformAdminPasswordInput {
  email: string;
  password: string;
}

/**
 * Recovery of the only platform administrator when there is nobody else to generate a link (or mail is
 * not configured). It needs shell access to the server, which is the proof of ownership. Other users
 * recover through the application.
 */
export async function resetPlatformAdminPassword(
  deps: { store: PlatformPasswordStore; hasher: PasswordHasher },
  input: ResetPlatformAdminPasswordInput,
): Promise<{ userId: number; email: string }> {
  const email = normalizeEmail(input.email);
  const problem = findPasswordProblem(input.password, [
    email,
    email.split('@')[0],
  ]);
  if (problem) {
    throw new CliInputError(problem);
  }

  const userId = await deps.store.findPlatformAdminId(email);
  if (userId === null) {
    throw new CliInputError(
      'No existe un administrador de plataforma activo con ese correo.',
    );
  }
  await deps.store.replacePassword(
    userId,
    await deps.hasher.hash(input.password),
  );
  return { userId, email };
}
