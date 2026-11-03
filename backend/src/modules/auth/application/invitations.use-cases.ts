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
  UNUSABLE_PASSWORD_HASH,
} from '../../../common/security/password-hasher.port.js';
import { assertStrongPassword } from '../../../common/security/password-policy.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { InvalidInvitationException } from './auth.errors.js';
import { AUDIT_ENTITY_USER, AuthAuditAction } from './auth.policy.js';
import {
  AUTH_ACCOUNT_REPOSITORY,
  type AuthAccount,
  type AuthAccountRepository,
} from './ports/auth-account.repository.js';
import {
  USER_TOKEN_REPOSITORY,
  type StoredUserToken,
  type UserTokenRepository,
} from './ports/user-token.repository.js';
import { displayNameOf } from './session-view.js';

export interface InvitationInfo {
  readonly email: string;
  readonly displayName: string;
  readonly expiresAt: Date;
}

interface ValidInvitation {
  readonly token: StoredUserToken;
  readonly account: AuthAccount;
}

/**
 * Finds the invited account behind a link. The link only works while the account is still waiting for
 * its first password: an invitation can never be used to overwrite the password of a working account.
 */
@Injectable()
export class InvitationResolver {
  constructor(
    @Inject(AUTH_ACCOUNT_REPOSITORY)
    private readonly accounts: AuthAccountRepository,
    @Inject(USER_TOKEN_REPOSITORY)
    private readonly tokens: UserTokenRepository,
    private readonly clock: Clock,
  ) {}

  async resolve(rawToken: string): Promise<ValidInvitation> {
    const token = await this.tokens.findByHash(
      hashOpaqueToken(rawToken),
      'EMAIL_VERIFICATION',
    );
    if (!token || token.usedAt || token.expiresAt <= this.clock.now()) {
      throw new InvalidInvitationException();
    }
    const account = await this.accounts.findById(token.userId);
    const isWaitingForPassword =
      account?.isActive === true &&
      account.passwordHash === UNUSABLE_PASSWORD_HASH;
    if (!account || !isWaitingForPassword) {
      throw new InvalidInvitationException();
    }
    return { token, account };
  }
}

/** POST /auth/invitations/lookup: lets the page show the form (or an error) before asking for a password. */
@Injectable()
export class GetInvitationUseCase {
  constructor(private readonly invitations: InvitationResolver) {}

  async execute(rawToken: string): Promise<InvitationInfo> {
    const { token, account } = await this.invitations.resolve(rawToken);
    return {
      email: account.email,
      displayName: displayNameOf(account.displayName, account.email),
      expiresAt: token.expiresAt,
    };
  }
}

export interface AcceptInvitationInput {
  readonly token: string;
  readonly password: string;
  readonly ipAddress: string | null;
}

/** Activates an invited account: stores the chosen password and verifies the e-mail. Does not sign in. */
@Injectable()
export class AcceptInvitationUseCase {
  constructor(
    private readonly invitations: InvitationResolver,
    @Inject(AUTH_ACCOUNT_REPOSITORY)
    private readonly accounts: AuthAccountRepository,
    @Inject(USER_TOKEN_REPOSITORY)
    private readonly tokens: UserTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(input: AcceptInvitationInput): Promise<void> {
    const { token, account } = await this.invitations.resolve(input.token);
    assertStrongPassword(input.password, [
      account.email,
      account.displayName ?? '',
    ]);
    const passwordHash = await this.hasher.hash(input.password);
    const now = this.clock.now();

    await this.transactions.run(async (transaction) => {
      const consumed = await this.tokens.consume(token.id, now, transaction);
      if (!consumed) {
        throw new InvalidInvitationException();
      }
      await this.accounts.setPassword(
        account.id,
        passwordHash,
        { verifyEmailAt: now },
        transaction,
      );
      await this.audit.record(
        {
          action: AuthAuditAction.INVITATION_ACCEPTED,
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
