import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import { MAILER, type Mailer } from '../../../common/mail/mailer.port.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import { RateLimitService } from '../../../common/rate-limit/rate-limit.service.js';
import { generateOpaqueToken } from '../../../common/security/opaque-token.js';
import { UNUSABLE_PASSWORD_HASH } from '../../../common/security/password-hasher.port.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { passwordResetLink, passwordResetMessage } from './auth-mail.js';
import {
  AUDIT_ENTITY_USER,
  AuthAuditAction,
  PASSWORD_RESET_EMAIL_RATE,
  PASSWORD_RESET_TOKEN_MINUTES,
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
import { normalizeEmail } from './session-token.issuer.js';

const RATE_LIMIT_NAME = 'password-reset-email';

/**
 * "I forgot my password". It answers the same whether the email exists or not: the caller always gets
 * a 202, and the only visible difference is the e-mail that arrives (or not) in the inbox.
 */
@Injectable()
export class RequestPasswordResetUseCase {
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
    private readonly rateLimit: RateLimitService,
    private readonly clock: Clock,
  ) {}

  async execute(rawEmail: string, ipAddress: string | null): Promise<void> {
    const email = normalizeEmail(rawEmail);
    await this.rateLimit.enforce(
      RATE_LIMIT_NAME,
      email,
      PASSWORD_RESET_EMAIL_RATE,
      'open',
    );

    const account = await this.accounts.findByEmail(email);
    // A pending invitation has no password to recover: it needs the invitation link.
    if (!account?.isActive || account.passwordHash === UNUSABLE_PASSWORD_HASH) {
      return;
    }

    const now = this.clock.now();
    const { token, hash } = generateOpaqueToken();
    await this.transactions.run(async (transaction) => {
      await this.tokens.invalidatePending(
        account.id,
        'PASSWORD_RESET',
        now,
        transaction,
      );
      await this.tokens.create(
        {
          userId: account.id,
          type: 'PASSWORD_RESET',
          tokenHash: hash,
          expiresAt: new Date(
            now.getTime() + PASSWORD_RESET_TOKEN_MINUTES * 60_000,
          ),
        },
        transaction,
      );
      await this.audit.record(
        {
          action: AuthAuditAction.PASSWORD_RESET_REQUESTED,
          entity: AUDIT_ENTITY_USER,
          entityId: account.id,
          actor: { userId: null, denominationId: null, congregationId: null },
          ipAddress,
        },
        transaction,
      );
    });

    // Not awaited: the time to hand the message to the mail server must not tell the email exists.
    void this.mailer.send(
      passwordResetMessage(
        account.email,
        passwordResetLink(this.settings.appBaseUrl, token),
        PASSWORD_RESET_TOKEN_MINUTES,
      ),
    );
  }
}
