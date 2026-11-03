import type { RateLimitService } from '../../../../common/rate-limit/rate-limit.service.js';
import type { AccessTokenService } from '../../../../common/security/access-token.service.js';
import type { Principal } from '../../../../common/security/request-context.js';
import type { AuthSettings } from '../auth.settings.js';
import { ChangePasswordUseCase } from '../change-password.use-case.js';
import { ConfirmPasswordResetUseCase } from '../confirm-password-reset.use-case.js';
import {
  ConfirmEmailVerificationUseCase,
  ResendEmailVerificationUseCase,
} from '../email-verification.use-cases.js';
import { GetSessionUseCase } from '../get-session.use-case.js';
import {
  AcceptInvitationUseCase,
  GetInvitationUseCase,
  InvitationResolver,
} from '../invitations.use-cases.js';
import { LoginUseCase } from '../login.use-case.js';
import { LogoutUseCase } from '../logout.use-case.js';
import { RefreshSessionUseCase } from '../refresh-session.use-case.js';
import { RequestPasswordResetUseCase } from '../request-password-reset.use-case.js';
import { SessionTokenIssuer } from '../session-token.issuer.js';
import {
  FakeAccounts,
  FakeAudit,
  FakeHasher,
  FakeMailer,
  FakeRateLimit,
  FakeRefreshTokens,
  FakeSessions,
  FakeTransactionRunner,
  FakeUserTokens,
  MutableClock,
} from './auth-fakes.js';

export const SETTINGS: AuthSettings = {
  refreshTtlSeconds: 7 * 24 * 3600,
  refreshMaxLifetimeSeconds: 30 * 24 * 3600,
  appBaseUrl: 'https://app.test',
  cookieSecure: false,
};

/** Signs nothing: the token only says who and which session, which is what the tests check. */
class FakeAccessTokens {
  sign(principal: Principal) {
    return Promise.resolve({
      token: `access:${principal.userId}:${principal.sessionId}`,
      expiresInSeconds: 900,
    });
  }
}

/** All the use cases of the module wired to in-memory ports. */
export function buildAuthHarness(options: { exposeDevLinks?: boolean } = {}) {
  const accounts = new FakeAccounts();
  const clock = new MutableClock();
  const refreshTokens = new FakeRefreshTokens(clock);
  const userTokens = new FakeUserTokens();
  const sessions = new FakeSessions();
  const hasher = new FakeHasher();
  const transactions = new FakeTransactionRunner();
  const audit = new FakeAudit();
  const mailer = new FakeMailer();
  const rateLimit = new FakeRateLimit();

  const issuer = new SessionTokenIssuer(
    refreshTokens,
    new FakeAccessTokens() as unknown as AccessTokenService,
    SETTINGS,
  );
  const limiter = rateLimit as unknown as RateLimitService;
  const invitations = new InvitationResolver(accounts, userTokens, clock);

  return {
    accounts,
    refreshTokens,
    userTokens,
    sessions,
    hasher,
    audit,
    mailer,
    rateLimit,
    clock,
    login: new LoginUseCase(
      accounts,
      sessions,
      hasher,
      transactions,
      audit,
      issuer,
      limiter,
      clock,
    ),
    refresh: new RefreshSessionUseCase(
      refreshTokens,
      accounts,
      sessions,
      transactions,
      audit,
      SETTINGS,
      issuer,
      clock,
    ),
    logout: new LogoutUseCase(refreshTokens, transactions, audit, clock),
    getSession: new GetSessionUseCase(accounts, sessions),
    requestReset: new RequestPasswordResetUseCase(
      accounts,
      userTokens,
      transactions,
      audit,
      mailer,
      SETTINGS,
      limiter,
      clock,
    ),
    confirmReset: new ConfirmPasswordResetUseCase(
      accounts,
      userTokens,
      refreshTokens,
      hasher,
      transactions,
      audit,
      clock,
    ),
    getInvitation: new GetInvitationUseCase(invitations),
    acceptInvitation: new AcceptInvitationUseCase(
      invitations,
      accounts,
      userTokens,
      hasher,
      transactions,
      audit,
      clock,
    ),
    confirmEmail: new ConfirmEmailVerificationUseCase(
      accounts,
      userTokens,
      transactions,
      audit,
      clock,
    ),
    resendEmail: new ResendEmailVerificationUseCase(
      accounts,
      userTokens,
      transactions,
      audit,
      mailer,
      SETTINGS,
      options.exposeDevLinks ?? true,
      limiter,
      clock,
    ),
    changePassword: new ChangePasswordUseCase(
      accounts,
      refreshTokens,
      hasher,
      transactions,
      audit,
      limiter,
      clock,
    ),
  };
}

export type AuthHarness = ReturnType<typeof buildAuthHarness>;
