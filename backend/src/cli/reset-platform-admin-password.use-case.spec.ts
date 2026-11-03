import type { PasswordHasher } from '../common/security/password-hasher.port.js';
import { CliInputError } from './create-platform-admin.use-case.js';
import {
  type PlatformPasswordStore,
  resetPlatformAdminPassword,
} from './reset-platform-admin-password.use-case.js';

class FakeStore implements PlatformPasswordStore {
  admins = new Map<string, number>([['admin@iglesia.org', 4]]);
  replaced: { userId: number; passwordHash: string }[] = [];

  findPlatformAdminId(email: string) {
    return Promise.resolve(this.admins.get(email) ?? null);
  }

  replacePassword(userId: number, passwordHash: string) {
    this.replaced.push({ userId, passwordHash });
    return Promise.resolve();
  }
}

const hasher: PasswordHasher = {
  hash: (plain) => Promise.resolve(`hashed(${plain.length})`),
  verify: () => Promise.resolve(true),
  needsRehash: () => false,
};

const input = { email: ' Admin@Iglesia.ORG ', password: 'Cordero2026Fuerte' };

describe('resetPlatformAdminPassword', () => {
  it('stores a hash of the new password for the platform administrator', async () => {
    const store = new FakeStore();

    const result = await resetPlatformAdminPassword({ store, hasher }, input);

    expect(result).toEqual({ userId: 4, email: 'admin@iglesia.org' });
    expect(store.replaced).toEqual([{ userId: 4, passwordHash: 'hashed(17)' }]);
  });

  it('refuses a weak password before touching anything', async () => {
    const store = new FakeStore();

    await expect(
      resetPlatformAdminPassword(
        { store, hasher },
        { ...input, password: '123' },
      ),
    ).rejects.toBeInstanceOf(CliInputError);
    expect(store.replaced).toHaveLength(0);
  });

  it('refuses an e-mail that is not an active platform administrator, so it cannot reset anyone else', async () => {
    const store = new FakeStore();

    await expect(
      resetPlatformAdminPassword(
        { store, hasher },
        { ...input, email: 'pastor@iglesia.org' },
      ),
    ).rejects.toThrow('No existe un administrador de plataforma activo');
    expect(store.replaced).toHaveLength(0);
  });
});
