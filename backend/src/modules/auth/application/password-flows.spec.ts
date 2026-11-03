import { InvalidInputException } from '../../../common/errors/domain.exception.js';
import { generateOpaqueToken } from '../../../common/security/opaque-token.js';
import { UNUSABLE_PASSWORD_HASH } from '../../../common/security/password-hasher.port.js';
import {
  InvalidCurrentPasswordException,
  InvalidInvitationException,
  InvalidRecoveryLinkException,
} from './auth.errors.js';
import { PASSWORD_RESET_TOKEN_MINUTES } from './auth.policy.js';
import { buildAccount, buildSession } from './testing/auth-fakes.js';
import { type AuthHarness, buildAuthHarness } from './testing/auth-harness.js';

const CURRENT = 'Clave-segura-2026';
const NEW_PASSWORD = 'Nueva-clave-2027';

function setup(): AuthHarness {
  const harness = buildAuthHarness();
  harness.accounts.add(buildAccount());
  harness.sessions.set(buildSession(1));
  return harness;
}

/** The link the mailer was handed, parsed back into its raw token. */
function tokenOfLastMail(harness: AuthHarness): string {
  const text = harness.mailer.sent.at(-1)?.text ?? '';
  const match = /token=([\w-]+)/.exec(text);
  if (!match) {
    throw new Error('No link in the mail');
  }
  return match[1];
}

describe('RequestPasswordResetUseCase', () => {
  it('sends a one-time link that lives 30 minutes and audits the request', async () => {
    const harness = setup();

    await harness.requestReset.execute('Laura@Iglesia.org', '10.0.0.7');

    const [mail] = harness.mailer.sent;
    expect(mail.to).toBe('laura@iglesia.org');
    expect(mail.kind).toBe('PASSWORD_RESET');
    expect(mail.text).toContain('https://app.test/login/reset-password?token=');
    const [stored] = harness.userTokens.rows;
    expect(stored.type).toBe('PASSWORD_RESET');
    expect(stored.expiresAt.getTime() - harness.clock.now().getTime()).toBe(
      PASSWORD_RESET_TOKEN_MINUTES * 60_000,
    );
    expect(stored.tokenHash).not.toContain(tokenOfLastMail(harness));
    expect(harness.audit.actions()).toEqual(['PASSWORD_RESET_REQUESTED']);
  });

  it('does and says nothing for an unknown, disabled or not yet activated account', async () => {
    const harness = setup();
    harness.accounts.add(
      buildAccount({ id: 2, email: 'off@iglesia.org', isActive: false }),
    );
    harness.accounts.add(
      buildAccount({
        id: 3,
        email: 'nuevo@iglesia.org',
        passwordHash: UNUSABLE_PASSWORD_HASH,
      }),
    );

    for (const email of [
      'nadie@iglesia.org',
      'off@iglesia.org',
      'nuevo@iglesia.org',
    ]) {
      await expect(
        harness.requestReset.execute(email, null),
      ).resolves.toBeUndefined();
    }

    expect(harness.mailer.sent).toHaveLength(0);
    expect(harness.userTokens.rows).toHaveLength(0);
  });

  it('replaces the previous link when a new one is requested', async () => {
    const harness = setup();

    await harness.requestReset.execute('laura@iglesia.org', null);
    const first = tokenOfLastMail(harness);
    await harness.requestReset.execute('laura@iglesia.org', null);

    await expect(
      harness.confirmReset.execute({
        token: first,
        newPassword: NEW_PASSWORD,
        ipAddress: null,
      }),
    ).rejects.toBeInstanceOf(InvalidRecoveryLinkException);
  });

  it('limits requests per email without failing the request when the counter store is down', async () => {
    const harness = setup();

    await harness.requestReset.execute('laura@iglesia.org', null);

    expect(harness.rateLimit.calls[0]).toMatchObject({
      name: 'password-reset-email',
      policy: 'open',
    });
  });
});

describe('ConfirmPasswordResetUseCase', () => {
  async function requestLink(harness: AuthHarness): Promise<string> {
    await harness.requestReset.execute('laura@iglesia.org', null);
    return tokenOfLastMail(harness);
  }

  it('sets the new password, closes every session and burns the link', async () => {
    const harness = setup();
    const signedIn = await harness.login.execute({
      email: 'laura@iglesia.org',
      password: CURRENT,
      ipAddress: null,
    });
    const token = await requestLink(harness);

    await harness.confirmReset.execute({
      token,
      newPassword: NEW_PASSWORD,
      ipAddress: null,
    });

    expect(harness.accounts.get(1).passwordHash).toBe(`hash:${NEW_PASSWORD}`);
    await expect(
      harness.refresh.execute(signedIn.refreshToken, null),
    ).rejects.toBeDefined();
    await expect(
      harness.confirmReset.execute({
        token,
        newPassword: 'Otra-clave-2028',
        ipAddress: null,
      }),
    ).rejects.toBeInstanceOf(InvalidRecoveryLinkException);
    expect(harness.audit.actions()).toContain('PASSWORD_RESET');
  });

  it('keeps the link usable when the password is too weak', async () => {
    const harness = setup();
    const token = await requestLink(harness);

    await expect(
      harness.confirmReset.execute({
        token,
        newPassword: 'corta1',
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    await expect(
      harness.confirmReset.execute({
        token,
        newPassword: NEW_PASSWORD,
        ipAddress: null,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects an unknown, expired or invitation token', async () => {
    const harness = setup();
    const token = await requestLink(harness);
    const unknown = generateOpaqueToken().token;

    await expect(
      harness.confirmReset.execute({
        token: unknown,
        newPassword: NEW_PASSWORD,
        ipAddress: null,
      }),
    ).rejects.toBeInstanceOf(InvalidRecoveryLinkException);

    harness.clock.advance((PASSWORD_RESET_TOKEN_MINUTES + 1) * 60_000);
    await expect(
      harness.confirmReset.execute({
        token,
        newPassword: NEW_PASSWORD,
        ipAddress: null,
      }),
    ).rejects.toBeInstanceOf(InvalidRecoveryLinkException);
  });

  it('does not accept an invitation link as a recovery link', async () => {
    const harness = setup();
    const invitation = generateOpaqueToken();
    harness.userTokens.rows.push({
      id: 50,
      userId: 1,
      type: 'EMAIL_VERIFICATION',
      tokenHash: invitation.hash,
      expiresAt: new Date(harness.clock.now().getTime() + 3_600_000),
      usedAt: null,
    });

    await expect(
      harness.confirmReset.execute({
        token: invitation.token,
        newPassword: NEW_PASSWORD,
        ipAddress: null,
      }),
    ).rejects.toBeInstanceOf(InvalidRecoveryLinkException);
  });

  it('only changes the password of the user the link was issued to', async () => {
    const harness = setup();
    harness.accounts.add(buildAccount({ id: 2, email: 'pedro@iglesia.org' }));
    const token = await requestLink(harness);

    await harness.confirmReset.execute({
      token,
      newPassword: NEW_PASSWORD,
      ipAddress: null,
    });

    expect(harness.accounts.get(2).passwordHash).toBe(`hash:${CURRENT}`);
  });
});

describe('invitations', () => {
  function invite(
    harness: AuthHarness,
    overrides: { hours?: number; passwordHash?: string } = {},
  ) {
    harness.accounts.add(
      buildAccount({
        id: 5,
        email: 'nuevo@iglesia.org',
        displayName: null,
        emailVerifiedAt: null,
        passwordHash: overrides.passwordHash ?? UNUSABLE_PASSWORD_HASH,
      }),
    );
    const { token, hash } = generateOpaqueToken();
    harness.userTokens.rows.push({
      id: 60,
      userId: 5,
      type: 'EMAIL_VERIFICATION',
      tokenHash: hash,
      expiresAt: new Date(
        harness.clock.now().getTime() + (overrides.hours ?? 72) * 3_600_000,
      ),
      usedAt: null,
    });
    return token;
  }

  it('describes a valid invitation with a name to show', async () => {
    const harness = setup();
    const token = invite(harness);

    const info = await harness.getInvitation.execute(token);

    expect(info.email).toBe('nuevo@iglesia.org');
    expect(info.displayName).toBe('nuevo');
  });

  it('activates the account with the chosen password and verifies the e-mail', async () => {
    const harness = setup();
    const token = invite(harness);

    await harness.acceptInvitation.execute({
      token,
      password: NEW_PASSWORD,
      ipAddress: null,
    });

    const account = harness.accounts.get(5);
    expect(account.passwordHash).toBe(`hash:${NEW_PASSWORD}`);
    expect(account.emailVerifiedAt).toEqual(harness.clock.now());
    expect(harness.audit.actions()).toEqual(['INVITATION_ACCEPTED']);
    await expect(harness.getInvitation.execute(token)).rejects.toBeInstanceOf(
      InvalidInvitationException,
    );
  });

  it('rejects a weak password without using up the invitation', async () => {
    const harness = setup();
    const token = invite(harness);

    await expect(
      harness.acceptInvitation.execute({
        token,
        password: 'abc',
        ipAddress: null,
      }),
    ).rejects.toBeInstanceOf(InvalidInputException);
    await expect(
      harness.acceptInvitation.execute({
        token,
        password: NEW_PASSWORD,
        ipAddress: null,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects an expired or unknown invitation', async () => {
    const harness = setup();
    const token = invite(harness, { hours: 72 });
    harness.clock.advance(73 * 3_600_000);

    await expect(harness.getInvitation.execute(token)).rejects.toBeInstanceOf(
      InvalidInvitationException,
    );
    await expect(
      harness.getInvitation.execute(generateOpaqueToken().token),
    ).rejects.toBeInstanceOf(InvalidInvitationException);
  });

  it('can never overwrite the password of an account that already works', async () => {
    const harness = setup();
    harness.accounts.add(buildAccount({ id: 5, email: 'nuevo@iglesia.org' }));
    const { token, hash } = generateOpaqueToken();
    harness.userTokens.rows.push({
      id: 61,
      userId: 5,
      type: 'EMAIL_VERIFICATION',
      tokenHash: hash,
      expiresAt: new Date(harness.clock.now().getTime() + 3_600_000),
      usedAt: null,
    });

    await expect(
      harness.acceptInvitation.execute({
        token,
        password: NEW_PASSWORD,
        ipAddress: null,
      }),
    ).rejects.toBeInstanceOf(InvalidInvitationException);
    expect(harness.accounts.get(5).passwordHash).toBe(`hash:${CURRENT}`);
  });

  it('does not accept a recovery link as an invitation', async () => {
    const harness = setup();
    invite(harness);
    const { token, hash } = generateOpaqueToken();
    harness.userTokens.rows.push({
      id: 62,
      userId: 5,
      type: 'PASSWORD_RESET',
      tokenHash: hash,
      expiresAt: new Date(harness.clock.now().getTime() + 3_600_000),
      usedAt: null,
    });

    await expect(harness.getInvitation.execute(token)).rejects.toBeInstanceOf(
      InvalidInvitationException,
    );
  });
});

describe('ChangePasswordUseCase', () => {
  async function twoSessions(harness: AuthHarness) {
    const credentials = {
      email: 'laura@iglesia.org',
      password: CURRENT,
      ipAddress: null,
    };
    const current = await harness.login.execute(credentials);
    const other = await harness.login.execute(credentials);
    const families = harness.refreshTokens.rows.map((row) => row.family);
    return { current, other, currentFamily: families[0] };
  }

  it('changes the password and closes the other sessions but not the current one', async () => {
    const harness = setup();
    const { current, other, currentFamily } = await twoSessions(harness);

    await harness.changePassword.execute({
      userId: 1,
      sessionId: currentFamily,
      currentPassword: CURRENT,
      newPassword: NEW_PASSWORD,
      ipAddress: null,
    });

    expect(harness.accounts.get(1).passwordHash).toBe(`hash:${NEW_PASSWORD}`);
    await expect(
      harness.refresh.execute(current.refreshToken, null),
    ).resolves.toBeDefined();
    await expect(
      harness.refresh.execute(other.refreshToken, null),
    ).rejects.toBeDefined();
    expect(harness.audit.actions().at(-1)).toBe('PASSWORD_CHANGED');
  });

  it('answers 400, not 401, when the current password is wrong', async () => {
    const harness = setup();

    const error = await harness.changePassword
      .execute({
        userId: 1,
        sessionId: 's',
        currentPassword: 'equivocada-1',
        newPassword: NEW_PASSWORD,
        ipAddress: null,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidCurrentPasswordException);
    expect((error as InvalidCurrentPasswordException).getStatus()).toBe(400);
  });

  it('refuses a new password that is weak or equal to the current one', async () => {
    const harness = setup();
    const base = {
      userId: 1,
      sessionId: 's',
      currentPassword: CURRENT,
      ipAddress: null,
    };

    await expect(
      harness.changePassword.execute({ ...base, newPassword: CURRENT }),
    ).rejects.toBeInstanceOf(InvalidInputException);
    await expect(
      harness.changePassword.execute({
        ...base,
        newPassword: 'laura@iglesia.org1',
      }),
    ).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
  });

  it('only touches the password of the signed-in user', async () => {
    const harness = setup();
    harness.accounts.add(buildAccount({ id: 2, email: 'pedro@iglesia.org' }));

    await harness.changePassword.execute({
      userId: 1,
      sessionId: 's',
      currentPassword: CURRENT,
      newPassword: NEW_PASSWORD,
      ipAddress: null,
    });

    expect(harness.accounts.get(2).passwordHash).toBe(`hash:${CURRENT}`);
  });
});
