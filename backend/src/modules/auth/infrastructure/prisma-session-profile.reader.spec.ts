import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PrismaSessionProfileReader } from './prisma-session-profile.reader.js';

const active = { isActive: true, deletedAt: null };

function role(overrides: Record<string, unknown>) {
  return {
    scope: 'CONGREGATION',
    denominationId: 1,
    congregationId: 10,
    role: {
      code: 'SECRETARY',
      name: 'Secretaría',
      rolePermissions: [
        { permission: { code: 'members.write' } },
        { permission: { code: 'members.read' } },
      ],
    },
    denomination: null,
    congregation: {
      name: 'Sede Norte',
      ...active,
      denomination: { ...active },
    },
    ...overrides,
  };
}

function readerWith(
  user: unknown,
  congregations: { id: number; denominationId: number; name: string }[] = [],
) {
  const prisma = {
    user: { findFirst: vi.fn().mockResolvedValue(user) },
    congregation: { findMany: vi.fn().mockResolvedValue(congregations) },
  };
  return {
    reader: new PrismaSessionProfileReader(prisma as unknown as PrismaService),
    prisma,
  };
}

const userWith = (
  roleAssignments: unknown[],
  displayName: string | null = 'Laura Gómez',
) => ({
  id: 1,
  email: 'laura@iglesia.org',
  displayName,
  roleAssignments,
});

describe('PrismaSessionProfileReader', () => {
  it('returns null for an unknown user', async () => {
    const { reader } = readerWith(null);

    expect(await reader.load(99)).toBeNull();
  });

  it('maps the roles with their sorted permissions and the scope label', async () => {
    const { reader } = readerWith(userWith([role({})]));

    const session = await reader.load(1);

    expect(session?.assignments).toEqual([
      {
        role: 'SECRETARY',
        roleName: 'Secretaría',
        permissions: ['members.read', 'members.write'],
        scope: {
          kind: 'CONGREGATION',
          denominationId: 1,
          congregationId: 10,
          label: 'Sede Norte',
        },
      },
    ]);
    expect(session?.selectableScopes).toHaveLength(1);
  });

  it('falls back to the part of the email before the @ when there is no display name', async () => {
    const { reader } = readerWith(userWith([role({})], null));

    expect((await reader.load(1))?.displayName).toBe('laura');
  });

  it('offers every active congregation of a denomination the user administers, platform first', async () => {
    const platform = role({
      scope: 'PLATFORM',
      denominationId: null,
      congregationId: null,
      role: {
        code: 'PLATFORM_ADMIN',
        name: 'Administrador de plataforma',
        rolePermissions: [],
      },
      congregation: null,
    });
    const denomination = role({
      scope: 'DENOMINATION',
      congregationId: null,
      role: {
        code: 'DENOMINATION_ADMIN',
        name: 'Administrador',
        rolePermissions: [],
      },
      denomination: { name: 'Iglesia Ejemplo', ...active },
      congregation: null,
    });
    const { reader, prisma } = readerWith(userWith([denomination, platform]), [
      { id: 12, denominationId: 1, name: 'Sede Sur' },
      { id: 10, denominationId: 1, name: 'Sede Norte' },
    ]);

    const session = await reader.load(1);

    expect(session?.selectableScopes.map((scope) => scope.label)).toEqual([
      'Plataforma',
      'Toda la denominación · Iglesia Ejemplo',
      'Sede Norte',
      'Sede Sur',
    ]);
    // Only the denominations the user administers, active congregations only.
    expect(prisma.congregation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { denominationId: { in: [1] }, isActive: true, deletedAt: null },
      }),
    );
  });

  it('leaves out roles whose denomination or congregation can no longer be used', async () => {
    const inactiveDenomination = role({
      scope: 'DENOMINATION',
      congregationId: null,
      denomination: { name: 'Cerrada', isActive: false, deletedAt: null },
      congregation: null,
    });
    const deletedCongregation = role({
      congregation: {
        name: 'Vieja',
        isActive: true,
        deletedAt: new Date(),
        denomination: { ...active },
      },
    });
    const congregationOfInactiveDenomination = role({
      congregation: {
        name: 'Otra',
        ...active,
        denomination: { isActive: false, deletedAt: null },
      },
    });
    const { reader } = readerWith(
      userWith([
        inactiveDenomination,
        deletedCongregation,
        congregationOfInactiveDenomination,
      ]),
    );

    const session = await reader.load(1);

    expect(session?.assignments).toEqual([]);
    expect(session?.selectableScopes).toEqual([]);
  });

  it('asks only for the active roles of that user (revoked roles never reach the session)', async () => {
    const { reader, prisma } = readerWith(userWith([role({})]));

    await reader.load(1);

    const query = prisma.user.findFirst.mock.calls[0][0] as {
      where: unknown;
      select: { roleAssignments: { where: unknown } };
    };
    expect(query.where).toEqual({ id: 1, deletedAt: null });
    expect(query.select.roleAssignments.where).toEqual({ revokedAt: null });
  });
});
