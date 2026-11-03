import type { PasswordHasher } from '../common/security/password-hasher.port.js';
import { findPasswordProblem } from '../common/security/password-policy.js';

/** A problem the operator can fix; the CLI prints its message and exits with an error. */
export class CliInputError extends Error {}

export interface NewPlatformAdmin {
  email: string;
  passwordHash: string;
  displayName: string | null;
  emailVerifiedAt: Date;
}

/** Persistence needed by the command. */
export interface PlatformAdminStore {
  hasActivePlatformAdmin(): Promise<boolean>;
  emailExists(email: string): Promise<boolean>;
  /** Creates the user and its PLATFORM_ADMIN assignment in one transaction. Returns the user id. */
  create(admin: NewPlatformAdmin): Promise<number>;
}

export interface CreatePlatformAdminInput {
  email: string;
  password: string;
  displayName?: string | null;
}

const MAX_EMAIL_LENGTH = 191;
const MAX_NAME_LENGTH = 150;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Creates the first platform administrator. It refuses to run when one already exists: from then on,
 * administrators are invited from the application, never created by hand.
 */
export async function createPlatformAdmin(
  deps: { store: PlatformAdminStore; hasher: PasswordHasher; now?: () => Date },
  input: CreatePlatformAdminInput,
): Promise<{ userId: number; email: string }> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_FORMAT.test(email) || email.length > MAX_EMAIL_LENGTH) {
    throw new CliInputError('El correo no tiene un formato válido.');
  }

  const displayName = input.displayName?.trim() || null;
  if (displayName !== null && displayName.length > MAX_NAME_LENGTH) {
    throw new CliInputError(
      `El nombre no puede superar ${MAX_NAME_LENGTH} caracteres.`,
    );
  }

  const problem = findPasswordProblem(input.password, [
    email,
    email.split('@')[0],
  ]);
  if (problem) {
    throw new CliInputError(problem);
  }

  if (await deps.store.hasActivePlatformAdmin()) {
    throw new CliInputError(
      'Ya existe un administrador de plataforma. Los demás se invitan desde la aplicación.',
    );
  }
  if (await deps.store.emailExists(email)) {
    throw new CliInputError('Ya existe un usuario con ese correo.');
  }

  const userId = await deps.store.create({
    email,
    passwordHash: await deps.hasher.hash(input.password),
    displayName,
    emailVerifiedAt: (deps.now ?? (() => new Date()))(),
  });
  return { userId, email };
}
