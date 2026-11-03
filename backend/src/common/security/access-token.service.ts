import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { parseDurationSeconds } from '../../config/duration.js';
import { Environment } from '../../config/environment.js';
import { UnauthenticatedException } from '../errors/domain.exception.js';
import { Principal } from './request-context.js';

const ALGORITHM = 'HS256';
const POSITIVE_INTEGER = /^[1-9]\d*$/;

interface AccessTokenPayload {
  sub: string;
  sid: string;
}

export interface SignedAccessToken {
  token: string;
  expiresInSeconds: number;
}

/**
 * Signs and verifies access tokens. They carry only the user and the session: roles and permissions
 * are read from the database on each request, so changes apply immediately.
 */
@Injectable()
export class AccessTokenService {
  private readonly expiresInSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<Environment, true>,
  ) {
    this.expiresInSeconds = parseDurationSeconds(
      config.get('JWT_EXPIRATION', { infer: true }),
    );
  }

  async sign(principal: Principal): Promise<SignedAccessToken> {
    const payload: AccessTokenPayload = {
      sub: String(principal.userId),
      sid: principal.sessionId,
    };
    const token = await this.jwt.signAsync(payload, {
      algorithm: ALGORITHM,
      expiresIn: this.expiresInSeconds,
    });
    return { token, expiresInSeconds: this.expiresInSeconds };
  }

  /** Rejects with a 401 for any invalid, expired or malformed token, without saying which. */
  async verify(token: string): Promise<Principal> {
    let payload: Partial<AccessTokenPayload>;
    try {
      payload = await this.jwt.verifyAsync<Partial<AccessTokenPayload>>(token, {
        algorithms: [ALGORITHM],
      });
    } catch {
      throw new UnauthenticatedException();
    }

    if (
      typeof payload.sub !== 'string' ||
      !POSITIVE_INTEGER.test(payload.sub) ||
      typeof payload.sid !== 'string' ||
      payload.sid.length === 0
    ) {
      throw new UnauthenticatedException();
    }
    return { userId: Number(payload.sub), sessionId: payload.sid };
  }
}
