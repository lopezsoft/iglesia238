import { Inject, Injectable } from '@nestjs/common';
import { UnauthenticatedException } from '../../../common/errors/domain.exception.js';
import { NoActiveRolesException } from './auth.errors.js';
import {
  AUTH_ACCOUNT_REPOSITORY,
  type AuthAccountRepository,
} from './ports/auth-account.repository.js';
import {
  SESSION_PROFILE_READER,
  type SessionProfileReader,
} from './ports/session-profile.reader.js';
import type { SessionView } from './session-view.js';

/** GET /auth/me: the session of the signed-in user, read fresh from the database (role changes show at once). */
@Injectable()
export class GetSessionUseCase {
  constructor(
    @Inject(AUTH_ACCOUNT_REPOSITORY)
    private readonly accounts: AuthAccountRepository,
    @Inject(SESSION_PROFILE_READER)
    private readonly sessions: SessionProfileReader,
  ) {}

  async execute(userId: number): Promise<SessionView> {
    const account = await this.accounts.findById(userId);
    if (!account?.isActive) {
      throw new UnauthenticatedException();
    }
    const session = await this.sessions.load(userId);
    if (!session) {
      throw new UnauthenticatedException();
    }
    if (session.assignments.length === 0) {
      throw new NoActiveRolesException();
    }
    return session;
  }
}
