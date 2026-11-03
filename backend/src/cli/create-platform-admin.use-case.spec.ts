import { PasswordHasher } from '../common/security/password-hasher.port.js';
import {
  CliInputError,
  NewPlatformAdmin,
  PlatformAdminStore,
  createPlatformAdmin,
} from './create-platform-admin.use-case.js';

class FakeStore implements PlatformAdminStore {
  created: NewPlatformAdmin[] = [];
  existingAdmin = false;
  existingEmails = new Set<string>();

  hasActivePlatformAdmin() {
    return Promise.resolve(this.existingAdmin);
  }

  emailExists(email: string) {
    return Promise.resolve(this.existingEmails.has(email));
  }

  create(admin: NewPlatformAdmin) {
    this.created.push(admin);
    return Promise.resolve(1);
  }
}

const hasher: PasswordHasher = {
  hash: (plain) => Promise.resolve(`hashed(${plain.length})`),
  verify: () => Promise.resolve(true),
  needsRehash: () => false,
};

const NOW = new Date('2026-11-02T12:00:00Z');
const input = { email: ' Admin@Iglesia.ORG ', password: 'Cordero2026Fuerte' };

function run(store: FakeStore, overrides: Partial<typeof input> = {}) {
  return createPlatformAdmin(
    { store, hasher, now: () => NOW },
    { ...input, ...overrides },
  );
}

describe('createPlatformAdmin', () => {
  it('creates the administrator with a normalized email and a hashed password', async () => {
    const store = new FakeStore();

    const result = await run(store);

    expect(result).toEqual({ userId: 1, email: 'admin@iglesia.org' });
    expect(store.created).toEqual([
      {
        email: 'admin@iglesia.org',
        passwordHash: 'hashed(17)',
        displayName: null,
        emailVerifiedAt: NOW,
      },
    ]);
  });

  it('never returns or stores the plain password', async () => {
    const store = new FakeStore();

    const result = await run(store);

    expect(JSON.stringify(result)).not.toContain('Cordero');
    expect(JSON.stringify(store.created)).not.toContain('Cordero');
  });

  it('refuses to run when a platform administrator already exists', async () => {
    const store = new FakeStore();
    store.existingAdmin = true;

    await expect(run(store)).rejects.toThrow('Ya existe un administrador');
    expect(store.created).toHaveLength(0);
  });

  it('refuses an email that already belongs to a user', async () => {
    const store = new FakeStore();
    store.existingEmails.add('admin@iglesia.org');

    await expect(run(store)).rejects.toBeInstanceOf(CliInputError);
    expect(store.created).toHaveLength(0);
  });

  it.each([
    '',
    'sin-arroba',
    'a@b',
    'a b@c.co',
    `${'x'.repeat(200)}@iglesia.org`,
  ])('rejects the email %j', async (email) => {
    const store = new FakeStore();

    await expect(run(store, { email })).rejects.toThrow('correo');
    expect(store.created).toHaveLength(0);
  });

  it('rejects a weak password without echoing it', async () => {
    const store = new FakeStore();
    const error = await run(store, { password: 'corta1' }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(CliInputError);
    expect((error as Error).message).not.toContain('corta1');
    expect(store.created).toHaveLength(0);
  });

  it('rejects a password that contains the email', async () => {
    const store = new FakeStore();

    await expect(
      run(store, {
        email: 'carolina.admin@iglesia.org',
        password: 'carolina.admin2026',
      }),
    ).rejects.toBeInstanceOf(CliInputError);
  });

  it('trims the display name and rejects a name that is too long', async () => {
    const store = new FakeStore();
    await createPlatformAdmin(
      { store, hasher, now: () => NOW },
      { ...input, displayName: '  Ana Gómez  ' },
    );
    expect(store.created[0].displayName).toBe('Ana Gómez');

    await expect(
      createPlatformAdmin(
        { store: new FakeStore(), hasher },
        { ...input, displayName: 'x'.repeat(151) },
      ),
    ).rejects.toThrow('nombre');
  });
});
