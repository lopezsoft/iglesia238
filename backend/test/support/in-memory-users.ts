import type { MailMessage, Mailer } from '../../src/common/mail/mailer.port.js';
import type { ScopeKind } from '../../src/common/tenancy/scope-key.js';
import type {
  AppLinks,
  AssignmentRecord,
  GrantScopeReader,
  LinkPurpose,
  NewAssignment,
  RoleCatalog,
  RoleRecord,
  ScopeCongregation,
  ScopeDenomination,
  UserDirectory,
  UserLinkStore,
  UserListFilter,
  UserRecord,
  Visibility,
} from '../../src/modules/users/application/users.ports.js';

interface StoredUser {
  id: number;
  displayName: string;
  email: string;
  isActive: boolean;
  hasPassword: boolean;
  lastLoginAt: Date | null;
}

interface StoredAssignment extends NewAssignment {
  id: number;
  createdAt: Date;
  revokedAt: Date | null;
}

export const DENOMINATION_1: ScopeDenomination = {
  id: 1,
  name: 'Monte de Sión',
};
export const DENOMINATION_2: ScopeDenomination = { id: 2, name: 'Vida Nueva' };
export const CONGREGATIONS: ScopeCongregation[] = [
  {
    id: 10,
    name: 'Sede Central',
    denominationId: 1,
    denominationName: 'Monte de Sión',
  },
  {
    id: 11,
    name: 'Sede Norte',
    denominationId: 1,
    denominationName: 'Monte de Sión',
  },
  {
    id: 20,
    name: 'Sede Vida',
    denominationId: 2,
    denominationName: 'Vida Nueva',
  },
];

const ROLES: RoleRecord[] = [
  {
    code: 'PLATFORM_ADMIN',
    name: 'Administrador de plataforma',
    description: null,
    permissions: [{ code: 'users.manage', description: null }],
  },
  {
    code: 'DENOMINATION_ADMIN',
    name: 'Administrador de denominación',
    description: null,
    permissions: [
      { code: 'users.manage', description: null },
      { code: 'congregations.manage', description: null },
    ],
  },
  {
    code: 'PASTOR',
    name: 'Pastor',
    description: null,
    permissions: [{ code: 'members.read', description: null }],
  },
  {
    code: 'SECRETARY',
    name: 'Secretario(a)',
    description: null,
    permissions: [],
  },
  {
    code: 'TREASURER',
    name: 'Tesorero(a)',
    description: null,
    permissions: [],
  },
];

/** In-memory users, assignments and tokens, shared by the fakes of the users module ports. */
export class InMemoryUsersWorld {
  users: StoredUser[] = [];
  assignments: StoredAssignment[] = [];
  links: {
    userId: number;
    purpose: LinkPurpose;
    tokenHash: string;
    expiresAt: Date;
    replacedOthers: boolean;
  }[] = [];
  inactiveDenominations = new Set<number>();
  inactiveCongregations = new Set<number>();
  private sequence = 1000;

  nextId(): number {
    return (this.sequence += 1);
  }

  addUser(
    values: Partial<StoredUser> & { email: string },
    ...roles: {
      role: string;
      scope: ScopeKind;
      denominationId?: number | null;
      congregationId?: number | null;
      grantedById?: number;
      revoked?: boolean;
    }[]
  ): StoredUser {
    const user: StoredUser = {
      id: this.nextId(),
      displayName: values.email.split('@')[0],
      isActive: true,
      hasPassword: true,
      lastLoginAt: null,
      ...values,
    };
    this.users.push(user);
    for (const role of roles) {
      const denominationId = role.denominationId ?? null;
      const congregationId = role.congregationId ?? null;
      this.assignments.push({
        id: this.nextId(),
        userId: user.id,
        roleCode: role.role,
        scope: role.scope,
        denominationId,
        congregationId,
        scopeKey:
          role.scope === 'PLATFORM'
            ? 'P'
            : role.scope === 'DENOMINATION'
              ? `D:${denominationId}`
              : `C:${congregationId}`,
        grantedById: role.grantedById ?? user.id,
        createdAt: new Date(
          `2026-01-${String(this.assignments.length + 1).padStart(2, '0')}T00:00:00.000Z`,
        ),
        revokedAt: role.revoked ? new Date('2026-02-01T00:00:00.000Z') : null,
      });
    }
    return user;
  }

  activeAssignmentsOf(userId: number): StoredAssignment[] {
    return this.assignments.filter(
      (a) => a.userId === userId && a.revokedAt === null,
    );
  }
}

export class InMemoryUserDirectory implements UserDirectory {
  constructor(private readonly world: InMemoryUsersWorld) {}

  private sees(visibility: Visibility, assignment: StoredAssignment): boolean {
    return (
      visibility.kind === 'PLATFORM' ||
      assignment.denominationId === visibility.denominationId
    );
  }

  private toAssignment(a: StoredAssignment): AssignmentRecord {
    const grantor = this.world.users.find((u) => u.id === a.grantedById);
    const denomination = [DENOMINATION_1, DENOMINATION_2].find(
      (d) => d.id === a.denominationId,
    );
    return {
      id: a.id,
      userId: a.userId,
      roleCode: a.roleCode,
      scope: a.scope,
      denominationId: a.denominationId,
      congregationId: a.congregationId,
      denominationName: denomination?.name ?? null,
      congregationName:
        CONGREGATIONS.find((c) => c.id === a.congregationId)?.name ?? null,
      grantedById: a.grantedById,
      grantedByName: grantor?.displayName ?? null,
      grantedByPlatform: this.world.assignments.some(
        (x) =>
          x.userId === a.grantedById &&
          x.scope === 'PLATFORM' &&
          x.revokedAt === null,
      ),
      createdAt: a.createdAt,
      revokedAt: a.revokedAt,
    };
  }

  private toUser(user: StoredUser, visibility: Visibility): UserRecord {
    const own = this.world.assignments.filter((a) => a.userId === user.id);
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      isActive: user.isActive,
      hasPassword: user.hasPassword,
      lastLoginAt: user.lastLoginAt,
      assignments: own
        .filter((a) => this.sees(visibility, a))
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
        )
        .map((a) => this.toAssignment(a)),
      // Revoked roles count too: an account that once worked elsewhere is not this tenant's.
      hasHiddenAssignments: own.some((a) => !this.sees(visibility, a)),
    };
  }

  private visibleUsers(visibility: Visibility): StoredUser[] {
    return this.world.users.filter(
      (user) =>
        visibility.kind === 'PLATFORM' ||
        this.world.assignments.some(
          (a) => a.userId === user.id && this.sees(visibility, a),
        ),
    );
  }

  list(visibility: Visibility, filter: UserListFilter) {
    const status = (user: StoredUser) =>
      !user.isActive
        ? 'INACTIVE'
        : user.hasPassword
          ? 'ACTIVE'
          : 'INVITATION_PENDING';
    const rows = this.visibleUsers(visibility)
      .filter(
        (user) =>
          `${user.displayName} ${user.email}`
            .toLowerCase()
            .includes(filter.search.toLowerCase()) &&
          (filter.status === null || status(user) === filter.status) &&
          (filter.role === null ||
            this.world.assignments.some(
              (a) =>
                a.userId === user.id &&
                a.revokedAt === null &&
                a.roleCode === filter.role &&
                this.sees(visibility, a),
            )),
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    const start = (filter.page - 1) * filter.pageSize;
    return Promise.resolve({
      items: rows
        .slice(start, start + filter.pageSize)
        .map((user) => this.toUser(user, visibility)),
      total: rows.length,
    });
  }

  findVisible(visibility: Visibility, userId: number) {
    const user = this.visibleUsers(visibility).find((u) => u.id === userId);
    return Promise.resolve(user ? this.toUser(user, visibility) : null);
  }

  findIdByEmail(email: string) {
    return Promise.resolve(
      this.world.users.find((u) => u.email === email)?.id ?? null,
    );
  }

  createInvitedUser(data: { email: string; displayName: string }) {
    return Promise.resolve(
      this.world.addUser({ ...data, hasPassword: false }).id,
    );
  }

  findAssignment(visibility: Visibility, assignmentId: number) {
    const found = this.world.assignments.find(
      (a) => a.id === assignmentId && this.sees(visibility, a),
    );
    return Promise.resolve(found ? this.toAssignment(found) : null);
  }

  hasActiveAssignment(userId: number, roleCode: string, scopeKey: string) {
    return Promise.resolve(
      this.world.assignments.some(
        (a) =>
          a.userId === userId &&
          a.roleCode === roleCode &&
          a.scopeKey === scopeKey &&
          a.revokedAt === null,
      ),
    );
  }

  insertAssignment(assignment: NewAssignment) {
    const stored = {
      ...assignment,
      id: this.world.nextId(),
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      revokedAt: null,
    };
    this.world.assignments.push(stored);
    return Promise.resolve(stored.id);
  }

  revokeAssignment(assignmentId: number, revokedAt: Date) {
    const found = this.world.assignments.find((a) => a.id === assignmentId);
    if (found) {
      found.revokedAt = revokedAt;
    }
    return Promise.resolve();
  }
}

export class InMemoryRoleCatalog implements RoleCatalog {
  list() {
    return Promise.resolve(ROLES);
  }

  exists(code: string) {
    return Promise.resolve(ROLES.some((role) => role.code === code));
  }
}

export class InMemoryGrantScopeReader implements GrantScopeReader {
  constructor(private readonly world: InMemoryUsersWorld) {}

  private activeDenominations() {
    return [DENOMINATION_1, DENOMINATION_2].filter(
      (d) => !this.world.inactiveDenominations.has(d.id),
    );
  }

  findActiveDenomination(id: number) {
    return Promise.resolve(
      this.activeDenominations().find((d) => d.id === id) ?? null,
    );
  }

  findActiveCongregation(id: number) {
    return Promise.resolve(
      this.activeCongregations().find((c) => c.id === id) ?? null,
    );
  }

  listActiveDenominations() {
    return Promise.resolve(this.activeDenominations());
  }

  listActiveCongregations(denominationId: number | null) {
    return Promise.resolve(
      this.activeCongregations().filter(
        (c) => denominationId === null || c.denominationId === denominationId,
      ),
    );
  }

  findDenominationName(id: number) {
    return Promise.resolve(
      [DENOMINATION_1, DENOMINATION_2].find((d) => d.id === id)?.name ?? null,
    );
  }

  private activeCongregations() {
    return CONGREGATIONS.filter(
      (c) =>
        !this.world.inactiveCongregations.has(c.id) &&
        !this.world.inactiveDenominations.has(c.denominationId),
    );
  }
}

export class InMemoryUserLinkStore implements UserLinkStore {
  constructor(private readonly world: InMemoryUsersWorld) {}

  replaceLink(link: {
    userId: number;
    purpose: LinkPurpose;
    tokenHash: string;
    expiresAt: Date;
  }) {
    const replacedOthers = this.world.links.some(
      (l) => l.userId === link.userId && l.purpose === link.purpose,
    );
    this.world.links = this.world.links.filter(
      (l) => !(l.userId === link.userId && l.purpose === link.purpose),
    );
    this.world.links.push({ ...link, replacedOthers });
    return Promise.resolve();
  }
}

export class FakeAppLinks implements AppLinks {
  invitation(token: string) {
    return `https://app.test/login/accept-invitation?token=${token}`;
  }

  passwordReset(token: string) {
    return `https://app.test/login/reset-password?token=${token}`;
  }
}

export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  delivered = true;

  send(message: MailMessage) {
    this.sent.push(message);
    return Promise.resolve({ delivered: this.delivered });
  }
}
