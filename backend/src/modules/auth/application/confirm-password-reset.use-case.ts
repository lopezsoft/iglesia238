import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import { hashOpaqueToken } from '../../../common/security/opaque-token.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../common/security/password-hasher.port.js';
import { assertStrongPassword } from '../../../common/security/password-policy.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { InvalidRecoveryLinkException } from './auth.errors.js';
import { AUDIT_ENTITY_USER, AuthAuditAction } from './auth.policy.js';
import {
  AUTH_ACCOUNT_REPOSITORY,
  type AuthAccountRepository,
} from './ports/auth-account.repository.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from './ports/refresh-token.repository.js';
import {
  USER_TOKEN_REPOSITORY,
  type UserTokenRepository,
} from './ports/user-token.repository.js';

export interface ConfirmPasswordResetInput {
  readonly token: string;
  readonly newPassword: string;
  readonly ipAddress: string | null;
}

/** Sets a new password with a recovery link and closes every open session of the user. */
@Injectable()
export class ConfirmPasswordResetUseCase {
  constructor(
    @Inject(AUTH_ACCOUNT_REPOSITORY)
    private readonly accounts: AuthAccountRepository,
    @Inject(USER_TOKEN_REPOSITORY)
    private readonly tokens: UserTokenRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(input: ConfirmPasswordResetInput): Promise<void> {
    const now = this.clock.now();
    const stored = await this.tokens.findByHash(
      hashOpaqueToken(input.token),
      'PASSWORD_RESET',
    );
    if (!stored || stored.usedAt || stored.expiresAt <= now) {
      throw new InvalidRecoveryLinkException();
    }
    const account = await this.accounts.findById(stored.userId);
    if (!account?.isActive) {
      throw new InvalidRecoveryLinkException();
    }

    // Checked before using the link, so a weak password does not burn it.
    assertStrongPassword(input.newPassword, [
      account.email,
      account.displayName ?? '',
    ]);
    const passwordHash = await this.hasher.hash(input.newPassword);

    await this.transactions.run(async (transaction) => {
      const consumed = await this.tokens.consume(stored.id, now, transaction);
      if (!consumed) {
        throw new InvalidRecoveryLinkException();
      }
      await this.accounts.setPassword(
        account.id,
        passwordHash,
        // Receiving the link proves the person owns the mailbox.
        { verifyEmailAt: account.emailVerifiedAt ? null : now },
        transaction,
      );
      await this.tokens.invalidatePending(
        account.id,
        'PASSWORD_RESET',
        now,
        transaction,
      );
      await this.refreshTokens.revokeAllOfUser(
        account.id,
        now,
        null,
        transaction,
      );
      await this.audit.record(
        {
          action: AuthAuditAction.PASSWORD_RESET,
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
  }
}
