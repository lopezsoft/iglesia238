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
import { Clock } from '../../../common/time/bogota-time.js';
import { AUDIT_ENTITY_USER, AuthAuditAction } from './auth.policy.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from './ports/refresh-token.repository.js';

/** Ends the session of the cookie. It works with an expired access token and never fails for an unknown cookie. */
@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    refreshToken: string | undefined,
    ipAddress: string | null,
  ): Promise<void> {
    if (!refreshToken) {
      return;
    }
    const stored = await this.refreshTokens.findByHash(
      hashOpaqueToken(refreshToken),
    );
    if (!stored) {
      return;
    }
    const now = this.clock.now();
    await this.transactions.run(async (transaction) => {
      await this.refreshTokens.revokeFamily(stored.family, now, transaction);
      await this.audit.record(
        {
          action: AuthAuditAction.LOGOUT,
          entity: AUDIT_ENTITY_USER,
          entityId: stored.userId,
          actor: {
            userId: stored.userId,
            denominationId: null,
            congregationId: null,
          },
          ipAddress,
        },
        transaction,
      );
    });
  }
}
