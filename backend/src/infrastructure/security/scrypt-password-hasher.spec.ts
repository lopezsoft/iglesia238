import { UNUSABLE_PASSWORD_HASH } from '../../common/security/password-hasher.port.js';
import {
  DEFAULT_SCRYPT_PARAMETERS,
  ScryptPasswordHasher,
} from './scrypt-password-hasher.js';

// Low cost: the tests check the logic, not the strength.
const CHEAP = { logN: 10, blockSize: 8, parallelization: 1 };

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher(CHEAP);

  it('produces a self-describing hash that never contains the password', async () => {
    const hash = await hasher.hash('Cordero2026Fuerte');

    expect(hash).toMatch(/^scrypt\$10\$8\$1\$[\w+/=]+\$[\w+/=]+$/);
    expect(hash).not.toContain('Cordero');
  });

  it('uses a different salt every time', async () => {
    const [first, second] = await Promise.all([
      hasher.hash('Cordero2026Fuerte'),
      hasher.hash('Cordero2026Fuerte'),
    ]);

    expect(first).not.toBe(second);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hasher.hash('Cordero2026Fuerte');

    await expect(hasher.verify('Cordero2026Fuerte', hash)).resolves.toBe(true);
    await expect(hasher.verify('Cordero2026fuerte', hash)).resolves.toBe(false);
    await expect(hasher.verify('', hash)).resolves.toBe(false);
  });

  it('treats equivalent unicode spellings as the same password', async () => {
    const hash = await hasher.hash('Contraseña2026x');

    await expect(hasher.verify('Contraseña2026x', hash)).resolves.toBe(true);
  });

  it('rejects the unusable hash of an invited user', async () => {
    await expect(
      hasher.verify('anything', UNUSABLE_PASSWORD_HASH),
    ).resolves.toBe(false);
  });

  it('rejects an unknown user (null hash) after doing the work', async () => {
    await expect(hasher.verify('anything', null)).resolves.toBe(false);
  });

  it.each([
    'scrypt$10$8$1$AAAA',
    'scrypt$x$8$1$AAAA$BBBB',
    'scrypt$99$8$1$AAAA$BBBB',
    'scrypt$10$0$1$AAAA$BBBB',
    'bcrypt$10$8$1$AAAA$BBBB',
    'scrypt$10$8$1$AAAA$BBBB$extra',
    '',
  ])('rejects the malformed hash %j without throwing', async (stored) => {
    await expect(hasher.verify('anything', stored)).resolves.toBe(false);
  });

  it('asks for a rehash only when the stored cost is lower than the current one', async () => {
    const weak = await hasher.hash('Cordero2026Fuerte');
    const stronger = new ScryptPasswordHasher({ ...CHEAP, logN: 11 });

    expect(hasher.needsRehash(weak)).toBe(false);
    expect(stronger.needsRehash(weak)).toBe(true);
    expect(hasher.needsRehash(UNUSABLE_PASSWORD_HASH)).toBe(true);
  });

  it('still verifies a hash made with older parameters', async () => {
    const weak = await hasher.hash('Cordero2026Fuerte');

    await expect(
      new ScryptPasswordHasher({ ...CHEAP, logN: 11 }).verify(
        'Cordero2026Fuerte',
        weak,
      ),
    ).resolves.toBe(true);
  });

  it('uses OWASP-grade defaults', () => {
    expect(DEFAULT_SCRYPT_PARAMETERS.logN).toBeGreaterThanOrEqual(16);
  });
});
