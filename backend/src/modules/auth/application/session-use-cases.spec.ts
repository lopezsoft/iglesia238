import { UnauthenticatedException } from '../../../common/errors/domain.exception.js';
import { NoActiveRolesException } from './auth.errors.js';
import { buildAccount, buildSession } from './testing/auth-fakes.js';
import { buildAuthHarness } from './testing/auth-harness.js';

function setup() {
  const harness = buildAuthHarness();
  harness.accounts.add(buildAccount());
  harness.sessions.set(buildSession(1));
  return harness;
}

describe('LogoutUseCase', () => {
  it('revokes the whole session of the cookie and audits it', async () => {
    const harness = setup();
    const { refreshToken } = await harness.login.execute({
      email: 'laura@iglesia.org',
      password: 'Clave-segura-2026',
      ipAddress: null,
    });
    const renewed = await harness.refresh.execute(refreshToken, null);

    await harness.logout.execute(renewed.refreshToken, '10.0.0.7');

    expect(
      harness.refreshTokens.active(harness.refreshTokens.rows[0].family),
    ).toBe(0);
    expect(harness.audit.actions().at(-1)).toBe('LOGOUT');
  });

  it('does nothing, without failing, for a missing or unknown cookie', async () => {
    const harness = setup();

    await expect(
      harness.logout.execute(undefined, null),
    ).resolves.toBeUndefined();
    await expect(
      harness.logout.execute('desconocido', null),
    ).resolves.toBeUndefined();
    expect(harness.audit.entries).toHaveLength(0);
  });

  it('leaves the sessions of other users untouched', async () => {
    const harness = setup();
    harness.accounts.add(buildAccount({ id: 2, email: 'pedro@iglesia.org' }));
    harness.sessions.set({ ...buildSession(2), email: 'pedro@iglesia.org' });
    const laura = await harness.login.execute({
      email: 'laura@iglesia.org',
      password: 'Clave-segura-2026',
      ipAddress: null,
    });
    await harness.login.execute({
      email: 'pedro@iglesia.org',
      password: 'Clave-segura-2026',
      ipAddress: null,
    });

    await harness.logout.execute(laura.refreshToken, null);

    const pedroRows = harness.refreshTokens.rows.filter(
      (row) => row.userId === 2,
    );
    expect(pedroRows.every((row) => row.revokedAt === null)).toBe(true);
  });
});

describe('GetSessionUseCase', () => {
  it('returns the session read fresh from the database', async () => {
    const harness = setup();

    const session = await harness.getSession.execute(1);

    expect(session.email).toBe('laura@iglesia.org');
  });

  it('rejects a disabled or deleted account', async () => {
    const harness = setup();
    harness.accounts.add(buildAccount({ isActive: false }));

    await expect(harness.getSession.execute(1)).rejects.toBeInstanceOf(
      UnauthenticatedException,
    );
    await expect(harness.getSession.execute(99)).rejects.toBeInstanceOf(
      UnauthenticatedException,
    );
  });

  it('reports an account whose roles were all revoked', async () => {
    const harness = setup();
    harness.sessions.set({
      ...buildSession(1),
      assignments: [],
      selectableScopes: [],
    });

    await expect(harness.getSession.execute(1)).rejects.toBeInstanceOf(
      NoActiveRolesException,
    );
  });

  it('never returns the session of another user', async () => {
    const harness = setup();
    harness.accounts.add(buildAccount({ id: 2, email: 'pedro@iglesia.org' }));
    harness.sessions.set({ ...buildSession(2), email: 'pedro@iglesia.org' });

    expect((await harness.getSession.execute(2)).id).toBe(2);
    expect((await harness.getSession.execute(1)).email).toBe(
      'laura@iglesia.org',
    );
  });
});
