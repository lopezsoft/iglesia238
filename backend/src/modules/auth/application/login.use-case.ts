import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import { RateLimitService } from '../../../common/rate-limit/rate-limit.service.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../common/security/password-hasher.port.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  InvalidCredentialsException,
  NoActiveRolesException,
} from './auth.errors.js';
import {
  AUDIT_ENTITY_USER,
  AuthAuditAction,
  LOCK_MINUTES,
  LOGIN_EMAIL_RATE,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from './auth.policy.js';
import {
  AUTH_ACCOUNT_REPOSITORY,
  type AuthAccount,
  type AuthAccountRepository,
} from './ports/auth-account.repository.js';
import {
  SESSION_PROFILE_READER,
  type SessionProfileReader,
} from './ports/session-profile.reader.js';
import {
  type AuthenticatedSession,
  normalizeEmail,
  SessionTokenIssuer,
} from './session-token.issuer.js';

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly ipAddress: string | null;
}

const RATE_LIMIT_NAME = 'login-email';

/**
 * Email and password sign-in. Unknown email, wrong password, disabled account and locked account all
 * answer the same (401), and the work done is the same, so neither the status, the message nor the
 * response time says which one it was. A lock therefore cannot be used to find out whether an address
 * is registered; the owner learns about it from the audit trail and the recovery flow.
 */
@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(AUTH_ACCOUNT_REPOSITORY)
    private readonly accounts: AuthAccountRepository,
    @Inject(SESSION_PROFILE_READER)
    private readonly sessions: SessionProfileReader,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly issuer: SessionTokenIssuer,
    private readonly rateLimit: RateLimitService,
    private readonly clock: Clock,
  ) {}

  async execute(input: LoginInput): Promise<AuthenticatedSession> {
    const email = normalizeEmail(input.email);
    // Closed: with the counter store down nobody can try passwords.
    await this.rateLimit.enforce(
      RATE_LIMIT_NAME,
      email,
      LOGIN_EMAIL_RATE,
      'closed',
    );

    const account = await this.accounts.findByEmail(email);
    const now = this.clock.now();

    const isLocked = Boolean(account?.lockedUntil && account.lockedUntil > now);

    // Also runs the hash for an unknown email and for a locked account, to take the same time. A locked
    // account refuses even the right password, so the lock cannot be opened by guessing.
    const passwordMatches = await this.hasher.verify(
      input.password,
      isLocked ? null : (account?.passwordHash ?? null),
    );
    if (isLocked) {
      throw new InvalidCredentialsException();
    }

    if (!account || !passwordMatches) {
      if (account) {
        await this.registerFailure(account, now, input.ipAddress);
      }
      throw new InvalidCredentialsException();
    }
    if (!account.isActive) {
      throw new InvalidCredentialsException();
    }

    const session = await this.sessions.load(account.id);
    if (!session || session.assignments.length === 0) {
      throw new NoActiveRolesException();
    }

    const upgradedHash = this.hasher.needsRehash(account.passwordHash)
      ? await this.hasher.hash(input.password)
      : null;
    const family = randomUUID();

    const issued = await this.transactions.run(async (transaction) => {
      await this.accounts.registerSuccessfulLogin(
        account.id,
        now,
        upgradedHash,
        transaction,
      );
      const tokens = await this.issuer.issue(
        account.id,
        family,
        session,
        now,
        transaction,
      );
      await this.audit.record(
        {
          action: AuthAuditAction.LOGIN,
          entity: AUDIT_ENTITY_USER,
          entityId: account.id,
          actor: {
            userId: account.id,
            denominationId: null,
            congregationId: null,
          },
          ipAddress: input.ipAddress,
        },
        transaction,
      );
      return tokens;
    });

    // A good sign-in clears the attempts counted for the email; a failure to do so is harmless.
    await this.rateLimit.reset(RATE_LIMIT_NAME, email);
    return issued;
  }

  /** Counts the failure and, at the limit, locks the account (audited). The caller answers 401 either way. */
  private async registerFailure(
    account: AuthAccount,
    now: Date,
    ipAddress: string | null,
  ): Promise<void> {
    const actor = {
      userId: account.id,
      denominationId: null,
      congregationId: null,
    };
    await this.transactions.run(async (transaction) => {
      const failure = await this.accounts.registerFailedLogin(
        account.id,
        now,
        { maxAttempts: MAX_FAILED_LOGIN_ATTEMPTS, lockMinutes: LOCK_MINUTES },
        transaction,
      );
      await this.audit.record(
        {
          action: failure.locked
            ? AuthAuditAction.ACCOUNT_LOCKED
            : AuthAuditAction.LOGIN_FAILED,
          entity: AUDIT_ENTITY_USER,
          entityId: account.id,
          actor,
          ipAddress,
        },
        transaction,
      );
    });
  }
}
