import { TooManyRequestsException } from '../../../common/errors/domain.exception.js';
import { hashOpaqueToken } from '../../../common/security/opaque-token.js';
import { UNUSABLE_PASSWORD_HASH } from '../../../common/security/password-hasher.port.js';
import {
  InvalidCredentialsException,
  NoActiveRolesException,
} from './auth.errors.js';
import { LOCK_MINUTES, MAX_FAILED_LOGIN_ATTEMPTS } from './auth.policy.js';
import { buildAccount, buildSession } from './testing/auth-fakes.js';
import { type AuthHarness, buildAuthHarness } from './testing/auth-harness.js';

const PASSWORD = 'Clave-segura-2026';

function setup(): AuthHarness {
  const harness = buildAuthHarness();
  harness.accounts.add(buildAccount());
  harness.sessions.set(buildSession(1));
  return harness;
}

const credentials = (
  overrides: Partial<{ email: string; password: string }> = {},
) => ({
  email: 'laura@iglesia.org',
  password: PASSWORD,
  ipAddress: '10.0.0.7',
  ...overrides,
});

describe('LoginUseCase', () => {
  it('signs in and returns the tokens and the session', async () => {
    const harness = setup();

    const result = await harness.login.execute(credentials());

    expect(result.accessToken).toMatch(/^access:1:/);
    expect(result.expiresIn).toBe(900);
    expect(result.session.assignments).toHaveLength(1);
    expect(harness.audit.actions()).toEqual(['LOGIN']);
    expect(harness.audit.entries[0].ipAddress).toBe('10.0.0.7');
    expect(harness.accounts.lastLoginAt.get(1)).toEqual(harness.clock.now());
    expect(harness.rateLimit.resets).toEqual(['login-email:laura@iglesia.org']);
  });

  it('stores only the hash of the refresh token and ties it to the session of the access token', async () => {
    const harness = setup();

    const result = await harness.login.execute(credentials());

    const [stored] = harness.refreshTokens.rows;
    expect(stored.tokenHash).toBe(hashOpaqueToken(result.refreshToken));
    expect(stored.tokenHash).not.toBe(result.refreshToken);
    expect(result.accessToken).toBe(`access:1:${stored.family}`);
    expect(stored.expiresAt.getTime() - harness.clock.now().getTime()).toBe(
      result.refreshMaxAgeSeconds * 1000,
    );
  });

  it('accepts the email in any case and with spaces around it', async () => {
    const harness = setup();

    await expect(
      harness.login.execute(credentials({ email: '  Laura@Iglesia.ORG ' })),
    ).resolves.toBeDefined();
  });

  it('answers the same for a wrong password and for an unknown email', async () => {
    const harness = setup();

    const wrongPassword = await harness.login
      .execute(credentials({ password: 'otra-clave-1' }))
      .catch((error: unknown) => error);
    const unknownEmail = await harness.login
      .execute(credentials({ email: 'nadie@iglesia.org' }))
      .catch((error: unknown) => error);

    expect(wrongPassword).toBeInstanceOf(InvalidCredentialsException);
    expect(unknownEmail).toBeInstanceOf(InvalidCredentialsException);
    expect((wrongPassword as Error).message).toBe(
      (unknownEmail as Error).message,
    );
  });

  it('counts the failures of a known account and audits them, but not those of an unknown email', async () => {
    const harness = setup();

    await harness.login
      .execute(credentials({ password: 'mala-1' }))
      .catch(() => undefined);
    await harness.login
      .execute(credentials({ email: 'nadie@iglesia.org' }))
      .catch(() => undefined);

    expect(harness.accounts.failedAttempts(1)).toBe(1);
    expect(harness.audit.actions()).toEqual(['LOGIN_FAILED']);
  });

  it('locks the account at the fifth failure and keeps it locked even with the right password', async () => {
    const harness = setup();

    for (let attempt = 1; attempt < MAX_FAILED_LOGIN_ATTEMPTS; attempt++) {
      await expect(
        harness.login.execute(credentials({ password: 'mala-1' })),
      ).rejects.toBeInstanceOf(InvalidCredentialsException);
    }
    // The fifth failure locks (and audits it) but still answers like any other wrong password.
    await expect(
      harness.login.execute(credentials({ password: 'mala-1' })),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
    expect(harness.audit.actions().at(-1)).toBe('ACCOUNT_LOCKED');

    const locked = await harness.login
      .execute(credentials())
      .catch((error: unknown) => error);
    expect(locked).toBeInstanceOf(InvalidCredentialsException);
    expect((locked as InvalidCredentialsException).getStatus()).toBe(401);
    expect((locked as InvalidCredentialsException).code).toBe(
      'INVALID_CREDENTIALS',
    );
    expect(harness.refreshTokens.rows).toHaveLength(0);
  });

  it('does the same hashing work for a locked account as for an unknown email, so time says nothing', async () => {
    const harness = setup();
    for (let attempt = 0; attempt < MAX_FAILED_LOGIN_ATTEMPTS; attempt++) {
      await harness.login
        .execute(credentials({ password: 'mala-1' }))
        .catch(() => undefined);
    }
    const verify = vi.spyOn(harness.hasher, 'verify');

    await harness.login.execute(credentials()).catch(() => undefined);
    await harness.login
      .execute(credentials({ email: 'nadie@iglesia.org' }))
      .catch(() => undefined);

    expect(verify).toHaveBeenCalledTimes(2);
    // Neither call compares against the real hash of the locked account.
    expect(verify.mock.calls.map((call) => call[1])).toEqual([null, null]);
  });

  it('lets the person in again once the lock has expired', async () => {
    const harness = setup();
    for (let attempt = 0; attempt < MAX_FAILED_LOGIN_ATTEMPTS; attempt++) {
      await harness.login
        .execute(credentials({ password: 'mala-1' }))
        .catch(() => undefined);
    }

    harness.clock.advance((LOCK_MINUTES + 1) * 60_000);

    await expect(harness.login.execute(credentials())).resolves.toBeDefined();
    expect(harness.accounts.failedAttempts(1)).toBe(0);
  });

  it('refuses a disabled account without saying why', async () => {
    const harness = setup();
    harness.accounts.add(buildAccount({ isActive: false }));

    await expect(harness.login.execute(credentials())).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(harness.refreshTokens.rows).toHaveLength(0);
  });

  it('refuses an invited account that has not chosen a password yet', async () => {
    const harness = setup();
    harness.accounts.add(
      buildAccount({ passwordHash: UNUSABLE_PASSWORD_HASH }),
    );

    await expect(
      harness.login.execute(credentials({ password: '!' })),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('refuses an account without active roles', async () => {
    const harness = setup();
    harness.sessions.set({
      ...buildSession(1),
      assignments: [],
      selectableScopes: [],
    });

    await expect(harness.login.execute(credentials())).rejects.toBeInstanceOf(
      NoActiveRolesException,
    );
    expect(harness.refreshTokens.rows).toHaveLength(0);
  });

  it('upgrades a hash made with weaker parameters', async () => {
    const harness = setup();
    harness.hasher.outdated = true;

    await harness.login.execute(credentials());

    expect(harness.accounts.get(1).passwordHash).toBe(`hash:${PASSWORD}`);
  });

  it('limits attempts per email and fails closed when the counter store is down', async () => {
    const harness = setup();

    await harness.login.execute(credentials());
    expect(harness.rateLimit.calls[0]).toMatchObject({
      name: 'login-email',
      identity: 'laura@iglesia.org',
      policy: 'closed',
    });

    harness.rateLimit.blocked = true;
    await expect(harness.login.execute(credentials())).rejects.toBeInstanceOf(
      TooManyRequestsException,
    );
  });

  it("gives each user their own session: another user's roles never leak into the token", async () => {
    const harness = setup();
    harness.accounts.add(buildAccount({ id: 2, email: 'pedro@iglesia.org' }));
    harness.sessions.set({
      ...buildSession(2),
      email: 'pedro@iglesia.org',
      displayName: 'Pedro',
    });

    const result = await harness.login.execute(
      credentials({ email: 'pedro@iglesia.org' }),
    );

    expect(result.session.id).toBe(2);
    expect(result.accessToken).toMatch(/^access:2:/);
  });
});
