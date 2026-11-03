import type { AuditEntry } from '../../../../common/audit/audit-recorder.port.js';
import type { MailMessage } from '../../../../common/mail/mailer.port.js';
import type { Transaction } from '../../../../common/persistence/transaction.js';
import type { RateLimitFailurePolicy } from '../../../../common/rate-limit/rate-limit.service.js';
import { TooManyRequestsException } from '../../../../common/errors/domain.exception.js';
import type { PasswordHasher } from '../../../../common/security/password-hasher.port.js';
import type { SessionValidator } from '../../../../common/security/session-validator.port.js';
import { Clock, SystemClock } from '../../../../common/time/bogota-time.js';
import type {
  AuthAccount,
  AuthAccountRepository,
  FailedLoginResult,
} from '../ports/auth-account.repository.js';
import type {
  NewRefreshToken,
  RefreshTokenRepository,
  StoredRefreshToken,
} from '../ports/refresh-token.repository.js';
import type { SessionProfileReader } from '../ports/session-profile.reader.js';
import type {
  NewUserToken,
  StoredUserToken,
  UserTokenKind,
  UserTokenRepository,
} from '../ports/user-token.repository.js';
import type { SessionView } from '../session-view.js';

/** Test doubles of the auth ports. Everything lives in memory and nothing talks to a database. */

export class MutableClock extends Clock {
  constructor(private current = new Date('2026-11-02T15:00:00.000Z')) {
    super();
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export const FAKE_TRANSACTION: Transaction = { kind: 'transaction' };

export class FakeTransactionRunner {
  /** Snapshots are not needed: use cases here only fail before they write. */
  run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    return work(FAKE_TRANSACTION);
  }
}

export class FakeAudit {
  readonly entries: AuditEntry[] = [];

  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }

  actions(): string[] {
    return this.entries.map((entry) => entry.action);
  }
}

export class FakeMailer {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<{ delivered: boolean }> {
    this.sent.push(message);
    return Promise.resolve({ delivered: true });
  }
}

/** "hash:<plain>" is easy to read in assertions and still self-describing enough for the use cases. */
export class FakeHasher implements PasswordHasher {
  outdated = false;

  hash(plain: string): Promise<string> {
    return Promise.resolve(`hash:${plain}`);
  }

  verify(plain: string, storedHash: string | null): Promise<boolean> {
    return Promise.resolve(
      storedHash !== null && storedHash === `hash:${plain}`,
    );
  }

  needsRehash(storedHash: string): boolean {
    return this.outdated && storedHash.startsWith('hash:');
  }
}

export class FakeRateLimit {
  readonly calls: {
    name: string;
    identity: string;
    policy: RateLimitFailurePolicy;
  }[] = [];
  blocked = false;
  readonly resets: string[] = [];

  reset(name: string, identity: string): Promise<void> {
    this.resets.push(`${name}:${identity}`);
    return Promise.resolve();
  }

  enforce(
    name: string,
    identity: string,
    _rule: unknown,
    policy: RateLimitFailurePolicy,
  ): Promise<void> {
    this.calls.push({ name, identity, policy });
    return this.blocked
      ? Promise.reject(new TooManyRequestsException(60))
      : Promise.resolve();
  }
}

export function buildAccount(
  overrides: Partial<AuthAccount> = {},
): AuthAccount {
  return {
    id: 1,
    email: 'laura@iglesia.org',
    displayName: 'Laura Gómez',
    passwordHash: 'hash:Clave-segura-2026',
    isActive: true,
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    lockedUntil: null,
    ...overrides,
  };
}

export class FakeAccounts implements AuthAccountRepository {
  readonly accounts = new Map<number, AuthAccount & { failed: number }>();
  lastLoginAt = new Map<number, Date>();

  add(account: AuthAccount): AuthAccount {
    this.accounts.set(account.id, { ...account, failed: 0 });
    return account;
  }

  failedAttempts(id: number): number {
    return this.accounts.get(id)?.failed ?? 0;
  }

  get(id: number): AuthAccount {
    return this.accounts.get(id) as AuthAccount;
  }

  findByEmail(email: string): Promise<AuthAccount | null> {
    const found = [...this.accounts.values()].find((a) => a.email === email);
    return Promise.resolve(found ?? null);
  }

  findById(id: number): Promise<AuthAccount | null> {
    return Promise.resolve(this.accounts.get(id) ?? null);
  }

  registerFailedLogin(
    userId: number,
    now: Date,
    policy: { maxAttempts: number; lockMinutes: number },
  ): Promise<FailedLoginResult> {
    const account = this.accounts.get(userId) as AuthAccount & {
      failed: number;
    };
    account.failed += 1;
    if (account.failed < policy.maxAttempts) {
      return Promise.resolve({ locked: false, lockedUntil: null });
    }
    const lockedUntil = new Date(now.getTime() + policy.lockMinutes * 60_000);
    this.accounts.set(userId, { ...account, failed: 0, lockedUntil });
    return Promise.resolve({ locked: true, lockedUntil });
  }

  registerSuccessfulLogin(
    userId: number,
    now: Date,
    upgradedPasswordHash: string | null,
  ): Promise<void> {
    const account = this.accounts.get(userId) as AuthAccount & {
      failed: number;
    };
    this.accounts.set(userId, {
      ...account,
      failed: 0,
      lockedUntil: null,
      passwordHash: upgradedPasswordHash ?? account.passwordHash,
    });
    this.lastLoginAt.set(userId, now);
    return Promise.resolve();
  }

  setPassword(
    userId: number,
    passwordHash: string,
    options: { verifyEmailAt: Date | null },
  ): Promise<void> {
    const account = this.accounts.get(userId) as AuthAccount & {
      failed: number;
    };
    this.accounts.set(userId, {
      ...account,
      passwordHash,
      failed: 0,
      lockedUntil: null,
      emailVerifiedAt: options.verifyEmailAt ?? account.emailVerifiedAt,
    });
    return Promise.resolve();
  }
}

interface RefreshRow {
  id: number;
  userId: number;
  family: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export class FakeRefreshTokens
  implements RefreshTokenRepository, SessionValidator
{
  readonly rows: RefreshRow[] = [];
  private nextId = 1;

  constructor(private readonly clock: Clock = new SystemClock()) {}

  create(token: NewRefreshToken): Promise<void> {
    this.rows.push({
      id: this.nextId++,
      revokedAt: null,
      createdAt: this.clock.now(),
      ...token,
    });
    return Promise.resolve();
  }

  findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    return Promise.resolve(
      this.rows.find((row) => row.tokenHash === tokenHash) ?? null,
    );
  }

  findFamilyStart(family: string): Promise<Date | null> {
    const first = this.rows.find((row) => row.family === family);
    return Promise.resolve(first?.createdAt ?? null);
  }

  revokeIfActive(id: number, now: Date): Promise<boolean> {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.revokedAt) {
      return Promise.resolve(false);
    }
    row.revokedAt = now;
    return Promise.resolve(true);
  }

  revokeFamily(family: string, now: Date): Promise<void> {
    for (const row of this.rows.filter(
      (r) => r.family === family && !r.revokedAt,
    )) {
      row.revokedAt = now;
    }
    return Promise.resolve();
  }

  revokeAllOfUser(
    userId: number,
    now: Date,
    exceptFamily: string | null,
  ): Promise<void> {
    for (const row of this.rows.filter(
      (r) => r.userId === userId && !r.revokedAt && r.family !== exceptFamily,
    )) {
      row.revokedAt = now;
    }
    return Promise.resolve();
  }

  isActive(userId: number, sessionId: string, now: Date): Promise<boolean> {
    return Promise.resolve(
      this.rows.some(
        (row) =>
          row.family === sessionId &&
          row.userId === userId &&
          !row.revokedAt &&
          row.expiresAt > now,
      ),
    );
  }

  active(family: string): number {
    return this.rows.filter((row) => row.family === family && !row.revokedAt)
      .length;
  }
}

interface UserTokenRow {
  id: number;
  userId: number;
  type: UserTokenKind;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export class FakeUserTokens implements UserTokenRepository {
  readonly rows: UserTokenRow[] = [];
  private nextId = 1;

  create(token: NewUserToken): Promise<void> {
    this.rows.push({ id: this.nextId++, usedAt: null, ...token });
    return Promise.resolve();
  }

  findByHash(
    tokenHash: string,
    type: UserTokenKind,
  ): Promise<StoredUserToken | null> {
    return Promise.resolve(
      this.rows.find(
        (row) => row.tokenHash === tokenHash && row.type === type,
      ) ?? null,
    );
  }

  consume(id: number, now: Date): Promise<boolean> {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.usedAt) {
      return Promise.resolve(false);
    }
    row.usedAt = now;
    return Promise.resolve(true);
  }

  invalidatePending(
    userId: number,
    type: UserTokenKind,
    now: Date,
  ): Promise<void> {
    for (const row of this.rows.filter(
      (r) => r.userId === userId && r.type === type && !r.usedAt,
    )) {
      row.usedAt = now;
    }
    return Promise.resolve();
  }
}

export class FakeSessions implements SessionProfileReader {
  readonly byUser = new Map<number, SessionView>();

  set(session: SessionView): void {
    this.byUser.set(session.id, session);
  }

  load(userId: number): Promise<SessionView | null> {
    return Promise.resolve(this.byUser.get(userId) ?? null);
  }
}

export function buildSession(id = 1): SessionView {
  return {
    id,
    displayName: 'Laura Gómez',
    email: 'laura@iglesia.org',
    assignments: [
      {
        role: 'SECRETARY',
        roleName: 'Secretaría',
        permissions: ['members.read'],
        scope: {
          kind: 'CONGREGATION',
          denominationId: 1,
          congregationId: 10,
          label: 'Sede Norte',
        },
      },
    ],
    selectableScopes: [
      {
        kind: 'CONGREGATION',
        denominationId: 1,
        congregationId: 10,
        label: 'Sede Norte',
      },
    ],
  };
}
