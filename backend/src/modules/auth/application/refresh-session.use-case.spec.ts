import { UnauthenticatedException } from '../../../common/errors/domain.exception.js';
import { REFRESH_REUSE_GRACE_SECONDS } from './auth.policy.js';
import { buildAccount, buildSession } from './testing/auth-fakes.js';
import { type AuthHarness, buildAuthHarness } from './testing/auth-harness.js';

async function signedIn(): Promise<{
  harness: AuthHarness;
  refreshToken: string;
  family: string;
}> {
  const harness = buildAuthHarness();
  harness.accounts.add(buildAccount());
  harness.sessions.set(buildSession(1));
  const result = await harness.login.execute({
    email: 'laura@iglesia.org',
    password: 'Clave-segura-2026',
    ipAddress: null,
  });
  return {
    harness,
    refreshToken: result.refreshToken,
    family: harness.refreshTokens.rows[0].family,
  };
}

describe('RefreshSessionUseCase', () => {
  it('rotates the refresh token inside the same session', async () => {
    const { harness, refreshToken, family } = await signedIn();

    const renewed = await harness.refresh.execute(refreshToken, null);

    expect(renewed.refreshToken).not.toBe(refreshToken);
    expect(renewed.accessToken).toBe(`access:1:${family}`);
    expect(renewed.session.id).toBe(1);
    expect(harness.refreshTokens.rows).toHaveLength(2);
    expect(harness.refreshTokens.active(family)).toBe(1);
  });

  it('refuses a missing, unknown or expired token', async () => {
    const { harness, refreshToken } = await signedIn();

    await expect(
      harness.refresh.execute(undefined, null),
    ).rejects.toBeInstanceOf(UnauthenticatedException);
    await expect(
      harness.refresh.execute('desconocido', null),
    ).rejects.toBeInstanceOf(UnauthenticatedException);

    harness.clock.advance(8 * 24 * 3600 * 1000);
    await expect(
      harness.refresh.execute(refreshToken, null),
    ).rejects.toBeInstanceOf(UnauthenticatedException);
  });

  it('ends a session at its absolute lifetime even when every rotation was on time', async () => {
    const { harness, refreshToken, family } = await signedIn();
    let current = refreshToken;
    // Rotate every 6 days (inside the 7-day sliding window) until just short of the 30-day cap.
    for (let step = 0; step < 4; step++) {
      harness.clock.advance(6 * 24 * 3600 * 1000);
      current = (await harness.refresh.execute(current, null)).refreshToken;
    }
    expect(harness.refreshTokens.active(family)).toBe(1);

    harness.clock.advance(7 * 24 * 3600 * 1000 - 1000);
    // 31 days after sign-in, though the token itself is still inside its own 7 days.
    await expect(harness.refresh.execute(current, null)).rejects.toBeInstanceOf(
      UnauthenticatedException,
    );
    expect(harness.refreshTokens.active(family)).toBe(0);
  });

  it('revokes the whole session when a rotated token comes back after the grace window', async () => {
    const { harness, refreshToken, family } = await signedIn();
    const renewed = await harness.refresh.execute(refreshToken, '10.0.0.9');

    harness.clock.advance((REFRESH_REUSE_GRACE_SECONDS + 5) * 1000);
    await expect(
      harness.refresh.execute(refreshToken, '10.0.0.9'),
    ).rejects.toBeInstanceOf(UnauthenticatedException);

    expect(harness.refreshTokens.active(family)).toBe(0);
    expect(harness.audit.actions()).toContain('REFRESH_REUSE_DETECTED');
    // The legitimate copy is dead too: the person must sign in again.
    await expect(
      harness.refresh.execute(renewed.refreshToken, null),
    ).rejects.toBeInstanceOf(UnauthenticatedException);
  });

  it('refuses but keeps the session when the same token arrives twice at once (two tabs)', async () => {
    const { harness, refreshToken, family } = await signedIn();
    const renewed = await harness.refresh.execute(refreshToken, null);

    await expect(
      harness.refresh.execute(refreshToken, null),
    ).rejects.toBeInstanceOf(UnauthenticatedException);

    expect(harness.refreshTokens.active(family)).toBe(1);
    expect(harness.audit.actions()).not.toContain('REFRESH_REUSE_DETECTED');
    await expect(
      harness.refresh.execute(renewed.refreshToken, null),
    ).resolves.toBeDefined();
  });

  it('ends the session of an account that was disabled after signing in', async () => {
    const { harness, refreshToken, family } = await signedIn();
    harness.accounts.add(buildAccount({ isActive: false }));

    await expect(
      harness.refresh.execute(refreshToken, null),
    ).rejects.toBeInstanceOf(UnauthenticatedException);
    expect(harness.refreshTokens.active(family)).toBe(0);
  });

  it('does not renew a session whose roles were all revoked', async () => {
    const { harness, refreshToken, family } = await signedIn();
    harness.sessions.set({
      ...buildSession(1),
      assignments: [],
      selectableScopes: [],
    });

    await expect(
      harness.refresh.execute(refreshToken, null),
    ).rejects.toMatchObject({
      code: 'NO_ACTIVE_ROLES',
    });
    expect(harness.refreshTokens.active(family)).toBe(0);
  });

  it('only renews the user the token belongs to', async () => {
    const { harness, refreshToken } = await signedIn();
    harness.accounts.add(buildAccount({ id: 2, email: 'pedro@iglesia.org' }));
    harness.sessions.set({ ...buildSession(2), email: 'pedro@iglesia.org' });

    const renewed = await harness.refresh.execute(refreshToken, null);

    expect(renewed.session.id).toBe(1);
    expect(harness.refreshTokens.rows.every((row) => row.userId === 1)).toBe(
      true,
    );
  });
});
