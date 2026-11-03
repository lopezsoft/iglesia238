import '../config/load-environment.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import { parseMariaDbUrl } from '../infrastructure/prisma/mariadb-connection.js';
import { ScryptPasswordHasher } from '../infrastructure/security/scrypt-password-hasher.js';
import { CliInputError } from './create-platform-admin.use-case.js';
import { promptHidden, promptLine } from './hidden-prompt.js';
import { PrismaPlatformPasswordStore } from './prisma-platform-password.store.js';
import { resetPlatformAdminPassword } from './reset-platform-admin-password.use-case.js';

// Usage: npm run admin:reset-password
// Reads PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD from the environment, or asks for them in the
// terminal; the password is typed hidden. Meant for the platform administrator who lost the password and
// has nobody else to generate a recovery link.

async function readCredentials(): Promise<{ email: string; password: string }> {
  const email =
    process.env.PLATFORM_ADMIN_EMAIL?.trim() ||
    (await promptLine('Correo del administrador de plataforma: '));

  const fromEnvironment = process.env.PLATFORM_ADMIN_PASSWORD;
  if (fromEnvironment) {
    return { email, password: fromEnvironment };
  }

  const password = await promptHidden('Contraseña nueva: ');
  const confirmation = await promptHidden('Repite la contraseña: ');
  if (password !== confirmation) {
    throw new CliInputError('Las contraseñas no coinciden.');
  }
  return { email, password };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new CliInputError('DATABASE_URL es obligatoria.');
  }

  const credentials = await readCredentials();
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(parseMariaDbUrl(databaseUrl)),
  });
  try {
    const admin = await resetPlatformAdminPassword(
      {
        store: new PrismaPlatformPasswordStore(prisma),
        hasher: new ScryptPasswordHasher(),
      },
      credentials,
    );
    // Only the email and the id are printed: never the password or its hash.
    process.stdout.write(
      `Contraseña actualizada para ${admin.email} (id ${admin.userId}). Se cerraron sus sesiones abiertas.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof CliInputError
      ? error.message
      : 'No se pudo actualizar la contraseña.';
  process.stderr.write(`${message}\n`);
  if (!(error instanceof CliInputError) && error instanceof Error) {
    // Technical detail for the operator; the credentials are never part of these messages.
    process.stderr.write(`${error.message}\n`);
  }
  process.exit(1);
});
