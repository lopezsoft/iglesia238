import {
  ConflictDomainException,
  ForbiddenDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  FixedClock,
  ImmediateTransactionRunner,
  RecordingAuditRecorder,
} from '../../../../test/support/foundation-fakes.js';
import {
  FakeAppLinks,
  FakeMailer,
  InMemoryGrantScopeReader,
  InMemoryRoleCatalog,
  InMemoryUserDirectory,
  InMemoryUserLinkStore,
  InMemoryUsersWorld,
} from '../../../../test/support/in-memory-users.js';
import { buildTenantContext } from '../../../../test/support/tenants.js';
import { hashOpaqueToken } from '../../../common/security/opaque-token.js';
import {
  InviteUserUseCase,
  IssueUserLinkUseCase,
} from './invitations.use-cases.js';
import {
  GrantRoleUseCase,
  RevokeRoleUseCase,
} from './role-commands.use-cases.js';
import {
  GetGrantContextUseCase,
  ListRolesUseCase,
  ListUsersUseCase,
} from './user-queries.use-cases.js';

function build() {
  const world = new InMemoryUsersWorld();
  const directory = new InMemoryUserDirectory(world);
  const roles = new InMemoryRoleCatalog();
  const scopes = new InMemoryGrantScopeReader(world);
  const links = new InMemoryUserLinkStore(world);
  const mailer = new FakeMailer();
  const audit = new RecordingAuditRecorder();
  const transactions = new ImmediateTransactionRunner();
  const clock = new FixedClock();

  const platformUser = world.addUser(
    { email: 'plataforma@iglesia238.example', displayName: 'Equipo Uno' },
    { role: 'PLATFORM_ADMIN', scope: 'PLATFORM' },
  );
  const admin1 = world.addUser(
    { email: 'admin1@montedesion.example', displayName: 'Andrés Admin' },
    {
      role: 'DENOMINATION_ADMIN',
      scope: 'DENOMINATION',
      denominationId: 1,
      grantedById: platformUser.id,
    },
  );
  const admin2 = world.addUser(
    { email: 'admin2@vidanueva.example', displayName: 'Ricardo Admin' },
    { role: 'DENOMINATION_ADMIN', scope: 'DENOMINATION', denominationId: 2 },
  );
  const pastor1 = world.addUser(
    { email: 'pastor1@montedesion.example', displayName: 'Daniel Pastor' },
    {
      role: 'PASTOR',
      scope: 'CONGREGATION',
      denominationId: 1,
      congregationId: 10,
      grantedById: admin1.id,
    },
  );
  const secretary2 = world.addUser(
    { email: 'sec2@vidanueva.example', displayName: 'Sandra Secretaria' },
    {
      role: 'SECRETARY',
      scope: 'CONGREGATION',
      denominationId: 2,
      congregationId: 20,
    },
  );
  // Works in both denominations: its account is shared.
  const shared = world.addUser(
    { email: 'compartido@example.com', displayName: 'Carlos Compartido' },
    {
      role: 'PASTOR',
      scope: 'CONGREGATION',
      denominationId: 1,
      congregationId: 11,
      grantedById: admin1.id,
    },
    {
      role: 'PASTOR',
      scope: 'CONGREGATION',
      denominationId: 2,
      congregationId: 20,
    },
  );

  const platformCtx = buildTenantContext({
    kind: 'PLATFORM',
    userId: platformUser.id,
    permissions: ['users.manage'],
  });
  const admin1Ctx = buildTenantContext({
    kind: 'DENOMINATION',
    denominationId: 1,
    userId: admin1.id,
    permissions: ['users.manage'],
  });
  const admin1InSedeCtx = buildTenantContext({
    kind: 'CONGREGATION',
    denominationId: 1,
    congregationId: 10,
    userId: admin1.id,
    permissions: ['users.manage'],
  });
  const admin2Ctx = buildTenantContext({
    kind: 'DENOMINATION',
    denominationId: 2,
    userId: admin2.id,
    permissions: ['users.manage'],
  });

  return {
    world,
    mailer,
    audit,
    platformUser,
    admin1,
    admin2,
    pastor1,
    secretary2,
    shared,
    platformCtx,
    admin1Ctx,
    admin1InSedeCtx,
    admin2Ctx,
    list: new ListUsersUseCase(directory),
    grantContext: new GetGrantContextUseCase(scopes),
    listRoles: new ListRolesUseCase(roles),
    grant: new GrantRoleUseCase(directory, roles, scopes, transactions, audit),
    revoke: new RevokeRoleUseCase(directory, transactions, audit, clock),
    invite: new InviteUserUseCase(
      directory,
      roles,
      scopes,
      links,
      new FakeAppLinks(),
      mailer,
      transactions,
      audit,
      clock,
    ),
    issueLink: new IssueUserLinkUseCase(
      directory,
      links,
      new FakeAppLinks(),
      mailer,
      transactions,
      audit,
      clock,
    ),
  };
}

const all = {
  search: '',
  role: null,
  status: null,
  page: 1,
  pageSize: 50,
} as const;
const ip = { ipAddress: '10.2.2.2' };

describe('ListUsersUseCase: tenant isolation', () => {
  it('shows the platform every user', async () => {
    const { list, platformCtx } = build();

    const page = await list.execute(platformCtx, all);

    expect(page.total).toBe(6);
  });

  it('shows a denomination administrator only users with a role in it, with only those roles', async () => {
    const { list, admin1Ctx, secretary2, shared, platformUser } = build();

    const page = await list.execute(admin1Ctx, all);

    const ids = page.items.map((user) => user.id);
    expect(ids).not.toContain(secretary2.id);
    expect(ids).not.toContain(platformUser.id);
    const sharedView = page.items.find((user) => user.id === shared.id);
    expect(sharedView?.assignments).toHaveLength(1);
    expect(sharedView?.assignments[0]).toMatchObject({
      denominationId: 1,
      scopeLabel: 'Sede Norte',
    });
  });

  it('keeps showing the whole denomination when the administrator looks at a sede', async () => {
    const { list, admin1InSedeCtx } = build();

    const page = await list.execute(admin1InSedeCtx, all);

    expect(page.items.map((user) => user.displayName).sort()).toEqual([
      'Andrés Admin',
      'Carlos Compartido',
      'Daniel Pastor',
    ]);
  });

  it('marks the administrator as self and hides platform names from a denomination', async () => {
    const { list, admin1Ctx, platformCtx, admin1 } = build();

    const forDenomination = await list.execute(admin1Ctx, all);
    const forPlatform = await list.execute(platformCtx, all);

    const own = forDenomination.items.find((user) => user.id === admin1.id);
    expect(own?.isSelf).toBe(true);
    expect(own?.assignments[0].grantedByName).toBe('Equipo de plataforma');
    const seenByPlatform = forPlatform.items.find(
      (user) => user.id === admin1.id,
    );
    expect(seenByPlatform?.assignments[0].grantedByName).toBe('Equipo Uno');
    expect(seenByPlatform?.isSelf).toBe(false);
  });

  it('filters by text, active role and status, and paginates', async () => {
    const { list, platformCtx, world } = build();
    world.addUser({
      email: 'pendiente@example.com',
      displayName: 'Paula Pendiente',
      hasPassword: false,
    });
    world.addUser({
      email: 'baja@example.com',
      displayName: 'Bruno Baja',
      isActive: false,
    });

    const byText = await list.execute(platformCtx, {
      ...all,
      search: 'PASTOR1',
    });
    const byRole = await list.execute(platformCtx, { ...all, role: 'PASTOR' });
    const pending = await list.execute(platformCtx, {
      ...all,
      status: 'INVITATION_PENDING',
    });
    const inactive = await list.execute(platformCtx, {
      ...all,
      status: 'INACTIVE',
    });
    const secondPage = await list.execute(platformCtx, {
      ...all,
      page: 2,
      pageSize: 3,
    });

    expect(byText.items.map((user) => user.email)).toEqual([
      'pastor1@montedesion.example',
    ]);
    expect(byRole.total).toBe(2);
    expect(pending.items.map((user) => user.status)).toEqual([
      'INVITATION_PENDING',
    ]);
    expect(inactive.items.map((user) => user.status)).toEqual(['INACTIVE']);
    expect(secondPage).toMatchObject({ page: 2, pageSize: 3, total: 8 });
    expect(secondPage.items).toHaveLength(3);
  });
});

describe('GetGrantContextUseCase', () => {
  it('offers the platform every active denomination and sede, and the platform role', async () => {
    const { grantContext, platformCtx, world } = build();
    world.inactiveCongregations.add(11);

    const context = await grantContext.execute(platformCtx);

    expect(context.isPlatformAdmin).toBe(true);
    expect(context.audienceLabel).toBe('Plataforma');
    expect(context.roles.map((role) => role.role)).toEqual([
      'PLATFORM_ADMIN',
      'DENOMINATION_ADMIN',
      'PASTOR',
      'SECRETARY',
      'TREASURER',
    ]);
    expect(context.roles[1].scopes.map((scope) => scope.label)).toEqual([
      'Toda la denominación · Monte de Sión',
      'Toda la denominación · Vida Nueva',
    ]);
    expect(context.roles[2].scopes.map((scope) => scope.label)).toEqual([
      'Sede Central · Monte de Sión',
      'Sede Vida · Vida Nueva',
    ]);
  });

  it('offers a denomination administrator only its own denomination and sedes, never the platform role', async () => {
    const { grantContext, admin1Ctx } = build();

    const context = await grantContext.execute(admin1Ctx);

    expect(context.isPlatformAdmin).toBe(false);
    expect(context.audienceLabel).toBe('Monte de Sión');
    expect(context.roles.map((role) => role.role)).not.toContain(
      'PLATFORM_ADMIN',
    );
    const labels = context.roles.flatMap((role) =>
      role.scopes.map((scope) => scope.label),
    );
    expect(labels).toContain('Toda la denominación');
    expect(labels).toContain('Sede Norte');
    expect(labels).not.toContain('Sede Vida');
  });
});

describe('GrantRoleUseCase', () => {
  it('lets the platform grant the denomination role and audits it with the scope', async () => {
    const { grant, platformCtx, pastor1, audit } = build();

    const view = await grant.execute({
      ...ip,
      context: platformCtx,
      userId: pastor1.id,
      role: 'DENOMINATION_ADMIN',
      denominationId: 1,
      congregationId: null,
    });

    expect(view).toMatchObject({
      role: 'DENOMINATION_ADMIN',
      scope: 'DENOMINATION',
      denominationId: 1,
      scopeLabel: 'Toda la denominación · Monte de Sión',
      revokedAt: null,
    });
    expect(audit.entries[0]).toMatchObject({
      action: 'ROLE_GRANTED',
      entity: 'UserRole',
      denominationId: 1,
      ipAddress: '10.2.2.2',
      changes: { scopeKey: { from: null, to: 'D:1' } },
    });
  });

  it('lets a denomination administrator grant sede roles inside its denomination only', async () => {
    const { grant, admin1Ctx, pastor1 } = build();

    await expect(
      grant.execute({
        ...ip,
        context: admin1Ctx,
        userId: pastor1.id,
        role: 'TREASURER',
        denominationId: null,
        congregationId: 11,
      }),
    ).resolves.toMatchObject({ role: 'TREASURER', scopeLabel: 'Sede Norte' });
    await expect(
      grant.execute({
        ...ip,
        context: admin1Ctx,
        userId: pastor1.id,
        role: 'TREASURER',
        denominationId: null,
        congregationId: 20,
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('never lets a denomination administrator grant the platform role or a role for another denomination', async () => {
    const { grant, admin1Ctx, pastor1 } = build();

    await expect(
      grant.execute({
        ...ip,
        context: admin1Ctx,
        userId: pastor1.id,
        role: 'PLATFORM_ADMIN',
        denominationId: null,
        congregationId: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    await expect(
      grant.execute({
        ...ip,
        context: admin1Ctx,
        userId: pastor1.id,
        role: 'DENOMINATION_ADMIN',
        denominationId: 2,
        congregationId: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });

  it('uses its own denomination when a denomination administrator grants the denomination role', async () => {
    const { grant, admin1Ctx, pastor1 } = build();

    const view = await grant.execute({
      ...ip,
      context: admin1Ctx,
      userId: pastor1.id,
      role: 'DENOMINATION_ADMIN',
      denominationId: null,
      congregationId: null,
    });

    expect(view.denominationId).toBe(1);
  });

  it('refuses to grant a role to yourself, even one the administrator role lacks', async () => {
    const { grant, admin1Ctx, platformCtx, admin1, world } = build();
    const before = world.assignments.length;

    await expect(
      grant.execute({
        ...ip,
        context: admin1Ctx,
        userId: admin1.id,
        role: 'TREASURER',
        denominationId: null,
        congregationId: 10,
      }),
    ).rejects.toMatchObject({ code: 'SELF_GRANT' });
    expect(world.assignments).toHaveLength(before);
    // Another administrator (here the platform) can still do it.
    await expect(
      grant.execute({
        ...ip,
        context: platformCtx,
        userId: admin1.id,
        role: 'TREASURER',
        denominationId: null,
        congregationId: 10,
      }),
    ).resolves.toMatchObject({ role: 'TREASURER' });
  });

  it('answers 404 for a user outside the reach of the administrator', async () => {
    const { grant, admin1Ctx, secretary2 } = build();

    await expect(
      grant.execute({
        ...ip,
        context: admin1Ctx,
        userId: secretary2.id,
        role: 'PASTOR',
        denominationId: null,
        congregationId: 10,
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('rejects a role the user already has active on that scope', async () => {
    const { grant, admin1Ctx, pastor1 } = build();

    await expect(
      grant.execute({
        ...ip,
        context: admin1Ctx,
        userId: pastor1.id,
        role: 'PASTOR',
        denominationId: null,
        congregationId: 10,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_ROLE' });
  });

  it('requires the scope and refuses inactive scopes and unknown roles', async () => {
    const { grant, platformCtx, pastor1, world } = build();
    world.inactiveDenominations.add(2);

    await expect(
      grant.execute({
        ...ip,
        context: platformCtx,
        userId: pastor1.id,
        role: 'PASTOR',
        denominationId: null,
        congregationId: null,
      }),
    ).rejects.toMatchObject({ code: 'SCOPE_REQUIRED' });
    await expect(
      grant.execute({
        ...ip,
        context: platformCtx,
        userId: pastor1.id,
        role: 'DENOMINATION_ADMIN',
        denominationId: 2,
        congregationId: null,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SCOPE' });
    await expect(
      grant.execute({
        ...ip,
        context: platformCtx,
        userId: pastor1.id,
        role: 'PASTOR',
        denominationId: null,
        congregationId: 20,
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      grant.execute({
        ...ip,
        context: platformCtx,
        userId: pastor1.id,
        role: 'GOD_MODE',
        denominationId: null,
        congregationId: null,
      }),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });
});

describe('RevokeRoleUseCase', () => {
  it('revokes, keeps the row, audits and frees the role to be granted again', async () => {
    const { revoke, grant, admin1Ctx, pastor1, world, audit } = build();
    const assignment = world.assignments.find((a) => a.userId === pastor1.id)!;

    const view = await revoke.execute({
      ...ip,
      context: admin1Ctx,
      assignmentId: assignment.id,
    });

    expect(view.revokedAt).toBe('2026-11-02T15:00:00.000Z');
    expect(world.assignments.some((a) => a.id === assignment.id)).toBe(true);
    expect(audit.entries[0]).toMatchObject({
      action: 'ROLE_REVOKED',
      entityId: assignment.id,
      changes: { role: { from: 'PASTOR', to: null } },
    });
    await expect(
      grant.execute({
        ...ip,
        context: admin1Ctx,
        userId: pastor1.id,
        role: 'PASTOR',
        denominationId: null,
        congregationId: 10,
      }),
    ).resolves.toMatchObject({ role: 'PASTOR' });
  });

  it('answers 404 for an assignment of another denomination or of the platform', async () => {
    const { revoke, admin1Ctx, secretary2, platformUser, world } = build();
    const foreign = world.assignments.find((a) => a.userId === secretary2.id)!;
    const platform = world.assignments.find(
      (a) => a.userId === platformUser.id,
    )!;

    await expect(
      revoke.execute({ ...ip, context: admin1Ctx, assignmentId: foreign.id }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      revoke.execute({ ...ip, context: admin1Ctx, assignmentId: platform.id }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(foreign.revokedAt).toBeNull();
  });

  it('refuses to revoke twice', async () => {
    const { revoke, admin1Ctx, pastor1, world } = build();
    const assignment = world.assignments.find((a) => a.userId === pastor1.id)!;
    await revoke.execute({
      ...ip,
      context: admin1Ctx,
      assignmentId: assignment.id,
    });

    await expect(
      revoke.execute({
        ...ip,
        context: admin1Ctx,
        assignmentId: assignment.id,
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_REVOKED' });
  });

  it('refuses to revoke your own administrator role but lets the platform revoke another admin', async () => {
    const { revoke, admin1Ctx, platformCtx, admin1, world } = build();
    const own = world.assignments.find((a) => a.userId === admin1.id)!;

    await expect(
      revoke.execute({ ...ip, context: admin1Ctx, assignmentId: own.id }),
    ).rejects.toMatchObject({ code: 'SELF_REVOKE' });
    await expect(
      revoke.execute({ ...ip, context: platformCtx, assignmentId: own.id }),
    ).resolves.toMatchObject({ role: 'DENOMINATION_ADMIN' });
    expect(
      world.assignments.find((a) => a.id === own.id)?.revokedAt,
    ).not.toBeNull();
  });

  it('is closed to the other denomination administrator', async () => {
    const { revoke, admin2Ctx, pastor1, world } = build();
    const assignment = world.assignments.find((a) => a.userId === pastor1.id)!;

    await expect(
      revoke.execute({
        ...ip,
        context: admin2Ctx,
        assignmentId: assignment.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });
});

describe('InviteUserUseCase', () => {
  const invitation = {
    displayName: '  Marta   Nueva ',
    email: ' Marta.Nueva@Example.COM ',
    role: 'SECRETARY',
    denominationId: null,
    congregationId: 10,
  };

  it('creates a pending user with the first role, a one-time link, the e-mail and the audit trail', async () => {
    const { invite, admin1Ctx, world, mailer, audit } = build();

    const result = await invite.execute({
      ...ip,
      ...invitation,
      context: admin1Ctx,
    });

    expect(result.user).toMatchObject({
      displayName: 'Marta Nueva',
      email: 'marta.nueva@example.com',
      status: 'INVITATION_PENDING',
    });
    expect(result.user.assignments).toHaveLength(1);
    const link = result.invitation;
    expect(link).toMatchObject({ purpose: 'INVITATION', emailDelivered: true });
    expect(link.expiresAt).toBe('2026-11-05T15:00:00.000Z');
    const token = new URL(link.link).searchParams.get('token')!;
    // Only the hash is stored.
    expect(world.links).toHaveLength(1);
    expect(world.links[0].tokenHash).toBe(hashOpaqueToken(token));
    expect(JSON.stringify(world.links)).not.toContain(token);
    expect(mailer.sent[0]).toMatchObject({
      kind: 'INVITATION',
      to: 'marta.nueva@example.com',
    });
    expect(audit.entries.map((entry) => entry.action)).toEqual([
      'USER_INVITED',
      'ROLE_GRANTED',
    ]);
    expect(JSON.stringify(audit.entries)).not.toContain(token);
    expect(JSON.stringify(audit.entries)).not.toContain('marta');
  });

  it('still returns the link when the e-mail cannot be sent', async () => {
    const { invite, admin1Ctx, mailer } = build();
    mailer.delivered = false;

    const result = await invite.execute({
      ...ip,
      ...invitation,
      context: admin1Ctx,
    });

    expect(result.invitation).toMatchObject({ emailDelivered: false });
    expect(result.invitation?.link).toContain(
      '/login/accept-invitation?token=',
    );
  });

  it('rejects an e-mail already listed for the administrator', async () => {
    const { invite, admin1Ctx } = build();

    await expect(
      invite.execute({
        ...ip,
        ...invitation,
        email: 'PASTOR1@montedesion.example',
        context: admin1Ctx,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_EMAIL' });
  });

  it('never attaches an account of another denomination: it answers like for a listed one and changes nothing', async () => {
    const { invite, admin1Ctx, secretary2, mailer, world } = build();
    const assignmentsBefore = world.assignments.length;

    await expect(
      invite.execute({
        ...ip,
        ...invitation,
        email: 'sec2@vidanueva.example',
        context: admin1Ctx,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_EMAIL' });

    expect(world.assignments).toHaveLength(assignmentsBefore);
    expect(
      world.assignments.filter((a) => a.userId === secretary2.id),
    ).toHaveLength(1);
    expect(mailer.sent).toHaveLength(0);
    expect(world.links).toHaveLength(0);
  });

  it('refuses to invite your own e-mail with SELF_GRANT', async () => {
    const { invite, admin1Ctx, admin1 } = build();

    await expect(
      invite.execute({
        ...ip,
        ...invitation,
        email: admin1.email,
        context: admin1Ctx,
      }),
    ).rejects.toMatchObject({ code: 'SELF_GRANT' });
  });

  it('validates the name, the e-mail and the scope with the same policy as granting', async () => {
    const { invite, admin1Ctx } = build();

    await expect(
      invite.execute({
        ...ip,
        ...invitation,
        displayName: 'Ab',
        context: admin1Ctx,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(
      invite.execute({
        ...ip,
        ...invitation,
        email: 'sin-arroba',
        context: admin1Ctx,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
    await expect(
      invite.execute({
        ...ip,
        ...invitation,
        role: 'PLATFORM_ADMIN',
        context: admin1Ctx,
      }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    await expect(
      invite.execute({
        ...ip,
        ...invitation,
        congregationId: 20,
        context: admin1Ctx,
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('does not create anything when the scope is refused', async () => {
    const { invite, admin1Ctx, world } = build();
    const before = world.users.length;

    await invite
      .execute({ ...ip, ...invitation, congregationId: 20, context: admin1Ctx })
      .catch(() => undefined);

    expect(world.users).toHaveLength(before);
  });

  it('lets the platform invite a denomination administrator', async () => {
    const { invite, platformCtx } = build();

    const result = await invite.execute({
      ...ip,
      ...invitation,
      role: 'DENOMINATION_ADMIN',
      denominationId: 2,
      congregationId: null,
      context: platformCtx,
    });

    expect(result.user.assignments[0]).toMatchObject({
      role: 'DENOMINATION_ADMIN',
      denominationId: 2,
    });
  });
});

describe('IssueUserLinkUseCase', () => {
  it('issues an invitation again for a user who never chose a password and replaces the old link', async () => {
    const { invite, issueLink, admin1Ctx, world } = build();
    const first = await invite.execute({
      ...ip,
      context: admin1Ctx,
      displayName: 'Marta Nueva',
      email: 'marta@example.com',
      role: 'SECRETARY',
      denominationId: null,
      congregationId: 10,
    });

    const link = await issueLink.execute({
      ...ip,
      context: admin1Ctx,
      userId: first.user.id,
    });

    expect(link.purpose).toBe('INVITATION');
    expect(link.link).toContain('/login/accept-invitation?token=');
    expect(world.links).toHaveLength(1);
    expect(world.links[0].replacedOthers).toBe(true);
  });

  it('issues a recovery link for an account that already has a password, and audits without the token', async () => {
    const { issueLink, admin1Ctx, pastor1, world, audit } = build();

    const link = await issueLink.execute({
      ...ip,
      context: admin1Ctx,
      userId: pastor1.id,
    });

    expect(link.purpose).toBe('PASSWORD_RESET');
    expect(link.link).toContain('/login/reset-password?token=');
    expect(link.expiresAt).toBe('2026-11-03T15:00:00.000Z');
    const token = new URL(link.link).searchParams.get('token')!;
    expect(world.links[0].tokenHash).toBe(hashOpaqueToken(token));
    expect(audit.entries[0]).toMatchObject({
      action: 'USER_LINK_ISSUED',
      entityId: pastor1.id,
    });
    expect(JSON.stringify(audit.entries)).not.toContain(token);
  });

  it('answers 404 for a user outside the reach of the administrator', async () => {
    const { issueLink, admin1Ctx, secretary2, world } = build();

    await expect(
      issueLink.execute({ ...ip, context: admin1Ctx, userId: secretary2.id }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(world.links).toHaveLength(0);
  });

  it('keeps a denomination administrator away from accounts that also work elsewhere, but not the platform', async () => {
    const { issueLink, admin1Ctx, platformCtx, shared } = build();

    await expect(
      issueLink.execute({ ...ip, context: admin1Ctx, userId: shared.id }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_SHARED' });
    await expect(
      issueLink.execute({ ...ip, context: platformCtx, userId: shared.id }),
    ).resolves.toMatchObject({ purpose: 'PASSWORD_RESET' });
  });

  it('keeps a denomination administrator away from an account whose roles elsewhere were all revoked', async () => {
    const { issueLink, admin1Ctx, shared, world } = build();
    for (const assignment of world.assignments.filter(
      (a) => a.userId === shared.id && a.denominationId === 2,
    )) {
      assignment.revokedAt = new Date('2026-10-01T00:00:00.000Z');
    }

    await expect(
      issueLink.execute({ ...ip, context: admin1Ctx, userId: shared.id }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_SHARED' });
  });

  it('keeps a denomination administrator from taking over another administrator, but not the platform', async () => {
    const { issueLink, invite, admin1Ctx, platformCtx, world } = build();
    const peer = await invite.execute({
      ...ip,
      context: platformCtx,
      displayName: 'Otro Admin',
      email: 'peer@example.com',
      role: 'DENOMINATION_ADMIN',
      denominationId: 1,
      congregationId: null,
    });
    world.users.find((u) => u.id === peer.user.id)!.hasPassword = true;

    await expect(
      issueLink.execute({ ...ip, context: admin1Ctx, userId: peer.user.id }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_PROTECTED' });
    await expect(
      issueLink.execute({ ...ip, context: platformCtx, userId: peer.user.id }),
    ).resolves.toMatchObject({ purpose: 'PASSWORD_RESET' });
  });

  it('tells the account holder by e-mail, without any link, when a recovery link is generated', async () => {
    const { issueLink, admin1Ctx, pastor1, mailer } = build();

    const link = await issueLink.execute({
      ...ip,
      context: admin1Ctx,
      userId: pastor1.id,
    });

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      kind: 'RECOVERY_NOTICE',
      to: pastor1.email,
    });
    const token = new URL(link.link).searchParams.get('token')!;
    expect(JSON.stringify(mailer.sent)).not.toContain(token);
    expect(mailer.sent[0].text).not.toContain('http');
  });

  it('does not send a notice when the link is an invitation', async () => {
    const { invite, issueLink, admin1Ctx, mailer } = build();
    const first = await invite.execute({
      ...ip,
      context: admin1Ctx,
      displayName: 'Marta Nueva',
      email: 'marta@example.com',
      role: 'SECRETARY',
      denominationId: null,
      congregationId: 10,
    });
    mailer.sent.length = 0;

    await issueLink.execute({
      ...ip,
      context: admin1Ctx,
      userId: first.user.id,
    });

    expect(mailer.sent).toHaveLength(0);
  });

  it('refuses an inactive account', async () => {
    const { issueLink, platformCtx, world } = build();
    const inactive = world.addUser({
      email: 'baja@example.com',
      isActive: false,
    });

    await expect(
      issueLink.execute({ ...ip, context: platformCtx, userId: inactive.id }),
    ).rejects.toBeInstanceOf(ConflictDomainException);
  });
});

describe('ListRolesUseCase', () => {
  it('returns the role matrix with the scope kind of each role', async () => {
    const { listRoles } = build();

    const matrix = await listRoles.execute();

    expect(matrix.roles.find((role) => role.code === 'PASTOR')).toMatchObject({
      scopeKind: 'CONGREGATION',
      permissions: ['members.read'],
    });
    expect(
      matrix.roles.find((role) => role.code === 'PLATFORM_ADMIN')?.scopeKind,
    ).toBe('PLATFORM');
    expect(matrix.permissions.map((permission) => permission.code)).toEqual([
      'congregations.manage',
      'members.read',
      'users.manage',
    ]);
  });
});
