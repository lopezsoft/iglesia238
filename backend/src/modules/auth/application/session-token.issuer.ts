import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { AccessTokenService } from '../../../common/security/access-token.service.js';
import { generateOpaqueToken } from '../../../common/security/opaque-token.js';
import { AUTH_SETTINGS, type AuthSettings } from './auth.settings.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from './ports/refresh-token.repository.js';
import type { SessionView } from './session-view.js';

/** What a successful login or refresh hands to the controller. */
export interface AuthenticatedSession {
  readonly accessToken: string;
  /** Seconds until the access token expires. */
  readonly expiresIn: number;
  /** Raw refresh token: the controller puts it in the HttpOnly cookie and never in the body. */
  readonly refreshToken: string;
  readonly refreshMaxAgeSeconds: number;
  readonly session: SessionView;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Creates the pair of tokens of a session: a rotating refresh token and a short access token. */
@Injectable()
export class SessionTokenIssuer {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly accessTokens: AccessTokenService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  /** `family` identifies the session: it is the `sid` of the access token and groups the rotations. */
  async issue(
    userId: number,
    family: string,
    session: SessionView,
    now: Date,
    transaction: Transaction,
  ): Promise<AuthenticatedSession> {
    const refresh = generateOpaqueToken();
    await this.refreshTokens.create(
      {
        userId,
        family,
        tokenHash: refresh.hash,
        expiresAt: new Date(
          now.getTime() + this.settings.refreshTtlSeconds * 1000,
        ),
      },
      transaction,
    );
    const access = await this.accessTokens.sign({ userId, sessionId: family });

    return {
      accessToken: access.token,
      expiresIn: access.expiresInSeconds,
      refreshToken: refresh.token,
      refreshMaxAgeSeconds: this.settings.refreshTtlSeconds,
      session,
    };
  }
}
