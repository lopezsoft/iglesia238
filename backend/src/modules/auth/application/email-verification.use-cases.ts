import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import { devLinkFor, EXPOSE_DEV_LINKS } from '../../../common/mail/dev-link.js';
import { MAILER, type Mailer } from '../../../common/mail/mailer.port.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import { RateLimitService } from '../../../common/rate-limit/rate-limit.service.js';
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from '../../../common/security/opaque-token.js';
import { UNUSABLE_PASSWORD_HASH } from '../../../common/security/password-hasher.port.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  emailVerificationLink,
  emailVerificationMessage,
} from './auth-mail.js';
import { InvalidRecoveryLinkException } from './auth.errors.js';
import {
  AUDIT_ENTITY_USER,
  AuthAuditAction,
  EMAIL_VERIFICATION_RESEND_RATE,
  EMAIL_VERIFICATION_TOKEN_HOURS,
} from './auth.policy.js';
import { AUTH_SETTINGS, type AuthSettings } from './auth.settings.js';
import {
  AUTH_ACCOUNT_REPOSITORY,
  type AuthAccountRepository,
} from './ports/auth-account.repository.js';
import {
  USER_TOKEN_REPOSITORY,
  type UserTokenRepository,
} from './ports/user-token.repository.js';

const HOUR_MS = 3_600_000;

export interface ConfirmEmailInput {
  readonly token: string;
  readonly ipAddress: string | null;
}

/**
 * POST /auth/email-verification/confirm: the person opened the link of the e-mail. The token works
 * once and expires; it is looked up by its SHA-256 hash, so the raw token is never compared with
 * anything and never stored. An invitation link (same token type, account without a password) is not
 * accepted here: it only serves /auth/invitations/accept.
 */
@Injectable()
export class ConfirmEmailVerificationUseCase {
  constructor(
    @Inject(AUTH_ACCOUNT_REPOSITORY)
    private readonly accounts: AuthAccountRepository,
    @Inject(USER_TOKEN_REPOSITORY)
    private readonly tokens: UserTokenRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(input: ConfirmEmailInput): Promise<void> {
    const now = this.clock.now();
    const stored = await this.tokens.findByHash(
      hashOpaqueToken(input.token),
      'EMAIL_VERIFICATION',
    );
    if (!stored || stored.usedAt || stored.expiresAt <= now) {
      throw new InvalidRecoveryLinkException();
    }
    const account = await this.accounts.findById(stored.userId);
    if (!account?.isActive || account.passwordHash === UNUSABLE_PASSWORD_HASH) {
      throw new InvalidRecoveryLinkException();
    }

    await this.transactions.run(async (transaction) => {
      const consumed = await this.tokens.consume(stored.id, now, transaction);
      if (!consumed) {
        throw new InvalidRecoveryLinkException();
      }
      // Any other open link of the account is no longer needed.
      await this.tokens.invalidatePending(
        account.id,
        'EMAIL_VERIFICATION',
        now,
        transaction,
      );
      if (account.emailVerifiedAt === null) {
        await this.accounts.markEmailVerified(account.id, now, transaction);
        await this.audit.record(
          {
            action: AuthAuditAction.EMAIL_VERIFIED,
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
      }
    });
  }
}

export interface ResendEmailVerificationInput {
  readonly userId: number;
  readonly ipAddress: string | null;
}

export interface ResendEmailVerificationResult {
  /** Only in development without SMTP (see devLinkFor). */
  readonly devVerificationLink?: string;
}

/**
 * POST /auth/email-verification/resend: a new link for the signed-in user. The answer is the same
 * whether the e-mail was already confirmed or not, and a new link replaces the open ones.
 */
@Injectable()
export class ResendEmailVerificationUseCase {
  constructor(
    @Inject(AUTH_ACCOUNT_REPOSITORY)
    private readonly accounts: AuthAccountRepository,
    @Inject(USER_TOKEN_REPOSITORY)
    private readonly tokens: UserTokenRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
    @Inject(EXPOSE_DEV_LINKS) private readonly exposeDevLinks: boolean,
    private readonly rateLimit: RateLimitService,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: ResendEmailVerificationInput,
  ): Promise<ResendEmailVerificationResult> {
    // Closed: every call sends an e-mail, so with the counter store down nothing is sent.
    await this.rateLimit.enforce(
      'email-verification-resend',
      `user:${input.userId}`,
      EMAIL_VERIFICATION_RESEND_RATE,
      'closed',
    );

    const account = await this.accounts.findById(input.userId);
    if (
      !account?.isActive ||
      account.emailVerifiedAt !== null ||
      account.passwordHash === UNUSABLE_PASSWORD_HASH
    ) {
      return {};
    }

    const now = this.clock.now();
    const { token, hash } = generateOpaqueToken();
    await this.transactions.run(async (transaction) => {
      await this.tokens.invalidatePending(
        account.id,
        'EMAIL_VERIFICATION',
        now,
        transaction,
      );
      await this.tokens.create(
        {
          userId: account.id,
          type: 'EMAIL_VERIFICATION',
          tokenHash: hash,
          expiresAt: new Date(
            now.getTime() + EMAIL_VERIFICATION_TOKEN_HOURS * HOUR_MS,
          ),
        },
        transaction,
      );
      await this.audit.record(
        {
          action: AuthAuditAction.EMAIL_VERIFICATION_REQUESTED,
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
    });

    const link = emailVerificationLink(this.settings.appBaseUrl, token);
    // Not awaited and never throws: the mail server's time must not change the answer.
    void this.mailer.send(
      emailVerificationMessage(
        account.email,
        link,
        EMAIL_VERIFICATION_TOKEN_HOURS,
      ),
    );
    const devVerificationLink = devLinkFor(
      this.mailer,
      this.exposeDevLinks,
      link,
    );
    return devVerificationLink ? { devVerificationLink } : {};
  }
}
