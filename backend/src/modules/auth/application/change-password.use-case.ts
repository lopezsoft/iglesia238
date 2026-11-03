import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  InvalidInputException,
  UnauthenticatedException,
} from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import { RateLimitService } from '../../../common/rate-limit/rate-limit.service.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../common/security/password-hasher.port.js';
import { assertStrongPassword } from '../../../common/security/password-policy.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { InvalidCurrentPasswordException } from './auth.errors.js';
import {
  AUDIT_ENTITY_USER,
  AuthAuditAction,
  CHANGE_PASSWORD_RATE,
} from './auth.policy.js';
import {
  AUTH_ACCOUNT_REPOSITORY,
  type AuthAccountRepository,
} from './ports/auth-account.repository.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from './ports/refresh-token.repository.js';

export interface ChangePasswordInput {
  readonly userId: number;
  /** Session (refresh token family) of the request: it stays open, the others are closed. */
  readonly sessionId: string;
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly ipAddress: string | null;
}

const RATE_LIMIT_NAME = 'change-password';

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(AUTH_ACCOUNT_REPOSITORY)
    private readonly accounts: AuthAccountRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly rateLimit: RateLimitService,
    private readonly clock: Clock,
  ) {}

  async execute(input: ChangePasswordInput): Promise<void> {
    await this.rateLimit.enforce(
      RATE_LIMIT_NAME,
      String(input.userId),
      CHANGE_PASSWORD_RATE,
      'closed',
    );
    const account = await this.accounts.findById(input.userId);
    if (!account?.isActive) {
      throw new UnauthenticatedException();
    }

    const isCurrentCorrect = await this.hasher.verify(
      input.currentPassword,
      account.passwordHash,
    );
    if (!isCurrentCorrect) {
      throw new InvalidCurrentPasswordException();
    }
    if (input.newPassword === input.currentPassword) {
      throw new InvalidInputException(
        'La contraseña nueva debe ser distinta de la actual.',
      );
    }
    assertStrongPassword(input.newPassword, [
      account.email,
      account.displayName ?? '',
    ]);

    const passwordHash = await this.hasher.hash(input.newPassword);
    const now = this.clock.now();
    await this.transactions.run(async (transaction) => {
      await this.accounts.setPassword(
        account.id,
        passwordHash,
        { verifyEmailAt: null },
        transaction,
      );
      await this.refreshTokens.revokeAllOfUser(
        account.id,
        now,
        input.sessionId,
        transaction,
      );
      await this.audit.record(
        {
          action: AuthAuditAction.PASSWORD_CHANGED,
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
