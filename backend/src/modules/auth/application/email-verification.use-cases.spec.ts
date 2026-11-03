import { TooManyRequestsException } from '../../../common/errors/domain.exception.js';
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from '../../../common/security/opaque-token.js';
import { UNUSABLE_PASSWORD_HASH } from '../../../common/security/password-hasher.port.js';
import { InvalidRecoveryLinkException } from './auth.errors.js';
import { EMAIL_VERIFICATION_TOKEN_HOURS } from './auth.policy.js';
import { buildAccount } from './testing/auth-fakes.js';
import { type AuthHarness, buildAuthHarness } from './testing/auth-harness.js';

const HOUR_MS = 3_600_000;

function setup(options: { exposeDevLinks?: boolean } = {}): AuthHarness {
  const harness = buildAuthHarness(options);
  harness.accounts.add(buildAccount({ emailVerifiedAt: null }));
  return harness;
}

/** Stores a confirmation token for the user and returns the raw token (what travels in the link). */
function issueToken(
  harness: AuthHarness,
  overrides: { userId?: number; expiresInHours?: number } = {},
): string {
  const { token, hash } = generateOpaqueToken();
  harness.userTokens.rows.push({
    id: harness.userTokens.rows.length + 100,
    userId: overrides.userId ?? 1,
    type: 'EMAIL_VERIFICATION',
    tokenHash: hash,
    expiresAt: new Date(
      harness.clock.now().getTime() +
        (overrides.expiresInHours ?? EMAIL_VERIFICATION_TOKEN_HOURS) * HOUR_MS,
    ),
    usedAt: null,
  });
  return token;
}

describe('ConfirmEmailVerificationUseCase', () => {
  it('verifies the e-mail, consumes the token and audits it', async () => {
    const harness = setup();
    const token = issueToken(harness);

    await harness.confirmEmail.execute({ token, ipAddress: '10.0.0.7' });

    expect(harness.accounts.get(1).emailVerifiedAt).toEqual(
      harness.clock.now(),
    );
    expect(harness.userTokens.rows[0].usedAt).toEqual(harness.clock.now());
    expect(harness.audit.actions()).toEqual(['EMAIL_VERIFIED']);
    expect(harness.audit.entries[0].ipAddress).toBe('10.0.0.7');
    // The trail carries no personal data and no token.
    expect(JSON.stringify(harness.audit.entries)).not.toContain(token);
  });

  it('works once: the same link a second time is refused', async () => {
    const harness = setup();
    const token = issueToken(harness);
    await harness.confirmEmail.execute({ token, ipAddress: null });

    await expect(
      harness.confirmEmail.execute({ token, ipAddress: null }),
    ).rejects.toBeInstanceOf(InvalidRecoveryLinkException);
  });

  it('refuses an expired link and leaves the e-mail unverified', async () => {
    const harness = setup();
    const token = issueToken(harness);
    harness.clock.advance(EMAIL_VERIFICATION_TOKEN_HOURS * HOUR_MS);

    await expect(
      harness.confirmEmail.execute({ token, ipAddress: null }),
    ).rejects.toBeInstanceOf(InvalidRecoveryLinkException);
    expect(harness.accounts.get(1).emailVerifiedAt).toBeNull();
  });

  it('refuses an unknown token and a token of another kind', async () => {
    const harness = setup();
    const reset = generateOpaqueToken();
    harness.userTokens.rows.push({
      id: 1,
      userId: 1,
      type: 'PASSWORD_RESET',
      tokenHash: reset.hash,
      expiresAt: new Date(harness.clock.now().getTime() + HOUR_MS),
      usedAt: null,
    });

    for (const token of [generateOpaqueToken().token, reset.token]) {
      await expect(
        harness.confirmEmail.execute({ token, ipAddress: null }),
      ).rejects.toBeInstanceOf(InvalidRecoveryLinkException);
    }
    expect(harness.accounts.get(1).emailVerifiedAt).toBeNull();
  });

  it('does not accept an invitation link (account without a password) nor a disabled account', async () => {
    const harness = setup();
    harness.accounts.add(
      buildAccount({
        id: 2,
        email: 'nuevo@iglesia.org',
        passwordHash: UNUSABLE_PASSWORD_HASH,
        emailVerifiedAt: null,
      }),
    );
    harness.accounts.add(
      buildAccount({
        id: 3,
        email: 'off@iglesia.org',
        isActive: false,
        emailVerifiedAt: null,
      }),
    );

    for (const userId of [2, 3]) {
      const token = issueToken(harness, { userId });
      await expect(
        harness.confirmEmail.execute({ token, ipAddress: null }),
      ).rejects.toBeInstanceOf(InvalidRecoveryLinkException);
      expect(harness.accounts.get(userId).emailVerifiedAt).toBeNull();
    }
    // The invitation stays usable for its own flow.
    expect(
      harness.userTokens.rows.find((r) => r.userId === 2)?.usedAt,
    ).toBeNull();
  });

  it('keeps the original date and writes no audit entry when the e-mail was already verified', async () => {
    const harness = buildAuthHarness();
    const original = new Date('2026-01-01T00:00:00.000Z');
    harness.accounts.add(buildAccount({ emailVerifiedAt: original }));
    const token = issueToken(harness);

    await harness.confirmEmail.execute({ token, ipAddress: null });

    expect(harness.accounts.get(1).emailVerifiedAt).toEqual(original);
    expect(harness.audit.entries).toHaveLength(0);
    expect(harness.userTokens.rows[0].usedAt).not.toBeNull();
  });

  it('stores only the hash of the token it looks up', () => {
    const harness = setup();
    const token = issueToken(harness);

    expect(harness.userTokens.rows[0].tokenHash).toBe(hashOpaqueToken(token));
    expect(harness.userTokens.rows[0].tokenHash).not.toBe(token);
  });
});

describe('ResendEmailVerificationUseCase', () => {
  it('replaces the open link with a new one of 72 hours and mails it', async () => {
    const harness = setup();
    issueToken(harness);

    const result = await harness.resendEmail.execute({
      userId: 1,
      ipAddress: '10.0.0.7',
    });

    const [old, fresh] = harness.userTokens.rows;
    expect(old.usedAt).not.toBeNull();
    expect(fresh.type).toBe('EMAIL_VERIFICATION');
    expect(fresh.usedAt).toBeNull();
    expect(fresh.expiresAt.getTime() - harness.clock.now().getTime()).toBe(
      EMAIL_VERIFICATION_TOKEN_HOURS * HOUR_MS,
    );
    const [mail] = harness.mailer.sent;
    expect(mail.to).toBe('laura@iglesia.org');
    expect(mail.kind).toBe('EMAIL_VERIFICATION');
    expect(mail.text).toContain('https://app.test/login/verify-email?token=');
    expect(harness.audit.actions()).toEqual(['EMAIL_VERIFICATION_REQUESTED']);
    expect(result.devVerificationLink).toBeUndefined();
  });

  it('does nothing visible for an account whose e-mail is already verified', async () => {
    const harness = buildAuthHarness();
    harness.accounts.add(buildAccount());

    const result = await harness.resendEmail.execute({
      userId: 1,
      ipAddress: null,
    });

    expect(result).toEqual({});
    expect(harness.mailer.sent).toHaveLength(0);
    expect(harness.userTokens.rows).toHaveLength(0);
  });

  it('returns the link only without SMTP and outside production', async () => {
    const withoutSmtp = setup();
    withoutSmtp.mailer.isConfigured = false;
    const devResult = await withoutSmtp.resendEmail.execute({
      userId: 1,
      ipAddress: null,
    });
    expect(devResult.devVerificationLink).toContain(
      'https://app.test/login/verify-email?token=',
    );

    const production = setup({ exposeDevLinks: false });
    production.mailer.isConfigured = false;
    expect(
      (await production.resendEmail.execute({ userId: 1, ipAddress: null }))
        .devVerificationLink,
    ).toBeUndefined();

    const withSmtp = setup();
    expect(
      (await withSmtp.resendEmail.execute({ userId: 1, ipAddress: null }))
        .devVerificationLink,
    ).toBeUndefined();
  });

  it('is limited per user and closes when the counter store fails', async () => {
    const harness = setup();

    await harness.resendEmail.execute({ userId: 1, ipAddress: null });
    expect(harness.rateLimit.calls).toEqual([
      {
        name: 'email-verification-resend',
        identity: 'user:1',
        policy: 'closed',
      },
    ]);

    harness.rateLimit.blocked = true;
    await expect(
      harness.resendEmail.execute({ userId: 1, ipAddress: null }),
    ).rejects.toBeInstanceOf(TooManyRequestsException);
  });
});
