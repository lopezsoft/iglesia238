import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import { UnauthenticatedException } from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import { hashOpaqueToken } from '../../../common/security/opaque-token.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { NoActiveRolesException } from './auth.errors.js';
import { AUTH_SETTINGS, type AuthSettings } from './auth.settings.js';
import {
  AUDIT_ENTITY_USER,
  AuthAuditAction,
  REFRESH_REUSE_GRACE_SECONDS,
} from './auth.policy.js';
import {
  AUTH_ACCOUNT_REPOSITORY,
  type AuthAccountRepository,
} from './ports/auth-account.repository.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  type StoredRefreshToken,
} from './ports/refresh-token.repository.js';
import {
  SESSION_PROFILE_READER,
  type SessionProfileReader,
} from './ports/session-profile.reader.js';
import {
  type AuthenticatedSession,
  SessionTokenIssuer,
} from './session-token.issuer.js';

const NO_SESSION_MESSAGE = 'Tu sesión expiró. Ingresa de nuevo.';

/**
 * Exchanges the refresh cookie for a new access token and a rotated refresh token. A token that was
 * already rotated and shows up again long after is a stolen copy: the whole family is revoked.
 */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(AUTH_ACCOUNT_REPOSITORY)
    private readonly accounts: AuthAccountRepository,
    @Inject(SESSION_PROFILE_READER)
    private readonly sessions: SessionProfileReader,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
    private readonly issuer: SessionTokenIssuer,
    private readonly clock: Clock,
  ) {}

  async execute(
    refreshToken: string | undefined,
    ipAddress: string | null,
  ): Promise<AuthenticatedSession> {
    if (!refreshToken) {
      throw new UnauthenticatedException(NO_SESSION_MESSAGE);
    }
    const stored = await this.refreshTokens.findByHash(
      hashOpaqueToken(refreshToken),
    );
    if (!stored) {
      throw new UnauthenticatedException(NO_SESSION_MESSAGE);
    }

    const now = this.clock.now();
    if (stored.revokedAt) {
      await this.handleRevokedToken(stored, now, ipAddress);
      throw new UnauthenticatedException(NO_SESSION_MESSAGE);
    }
    if (stored.expiresAt <= now) {
      throw new UnauthenticatedException(NO_SESSION_MESSAGE);
    }
    // Rotating renews the token, not the session: a copy kept alive by rotation still ends at the cap.
    const startedAt = await this.refreshTokens.findFamilyStart(stored.family);
    if (
      startedAt &&
      now.getTime() - startedAt.getTime() >
        this.settings.refreshMaxLifetimeSeconds * 1000
    ) {
      await this.refreshTokens.revokeFamily(stored.family, now);
      throw new UnauthenticatedException(NO_SESSION_MESSAGE);
    }

    const account = await this.accounts.findById(stored.userId);
    if (!account?.isActive) {
      await this.refreshTokens.revokeFamily(stored.family, now);
      throw new UnauthenticatedException(NO_SESSION_MESSAGE);
    }
    const session = await this.sessions.load(account.id);
    if (!session || session.assignments.length === 0) {
      await this.refreshTokens.revokeFamily(stored.family, now);
      throw new NoActiveRolesException();
    }

    return this.transactions.run(async (transaction) => {
      const wasActive = await this.refreshTokens.revokeIfActive(
        stored.id,
        now,
        transaction,
      );
      if (!wasActive) {
        // Another request rotated this same token an instant ago.
        throw new UnauthenticatedException(NO_SESSION_MESSAGE);
      }
      return this.issuer.issue(
        account.id,
        stored.family,
        session,
        now,
        transaction,
      );
    });
  }

  private async handleRevokedToken(
    stored: StoredRefreshToken,
    now: Date,
    ipAddress: string | null,
  ): Promise<void> {
    const revokedAt = stored.revokedAt as Date;
    const secondsAgo = (now.getTime() - revokedAt.getTime()) / 1000;
    if (secondsAgo <= REFRESH_REUSE_GRACE_SECONDS) {
      return;
    }
    await this.transactions.run(async (transaction) => {
      await this.refreshTokens.revokeFamily(stored.family, now, transaction);
      await this.audit.record(
        {
          action: AuthAuditAction.REFRESH_REUSE_DETECTED,
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
