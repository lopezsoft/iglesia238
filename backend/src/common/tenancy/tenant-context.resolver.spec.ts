import {
  ForbiddenDomainException,
  InvalidInputException,
  UnauthenticatedException,
} from '../errors/domain.exception.js';
import {
  AssignmentsReader,
  RoleAssignmentView,
  UserAccess,
} from './assignments-reader.port.js';
import { TenantContextResolver } from './tenant-context.resolver.js';

const platformAdmin: RoleAssignmentView = {
  roleCode: 'PLATFORM_ADMIN',
  kind: 'PLATFORM',
  scopeKey: 'P',
  denominationId: null,
  congregationId: null,
  permissions: ['denominations.manage', 'users.manage'],
};
const denominationAdmin: RoleAssignmentView = {
  roleCode: 'DENOMINATION_ADMIN',
  kind: 'DENOMINATION',
  scopeKey: 'D:1',
  denominationId: 1,
  congregationId: null,
  permissions: ['congregations.manage', 'members.read'],
};
const treasurer: RoleAssignmentView = {
  roleCode: 'TREASURER',
  kind: 'CONGREGATION',
  scopeKey: 'C:10',
  denominationId: 1,
  congregationId: 10,
  permissions: ['contributions.write'],
};
const secretary: RoleAssignmentView = {
  roleCode: 'SECRETARY',
  kind: 'CONGREGATION',
  scopeKey: 'C:10',
  denominationId: 1,
  congregationId: 10,
  permissions: ['members.write', 'members.read'],
};

// Congregations that exist: 10 and 11 belong to denomination 1, 20 to denomination 2.
const congregationDenominations = new Map([
  [10, 1],
  [11, 1],
  [20, 2],
]);

function createResolver(access: Partial<UserAccess> | null) {
  const loadAccess = vi
    .fn()
    .mockResolvedValue(
      access === null
        ? null
        : { userId: 5, isActive: true, assignments: [], ...access },
    );
  const findCongregationDenominationId = vi.fn((id: number) =>
    Promise.resolve(congregationDenominations.get(id) ?? null),
  );
  const reader: AssignmentsReader = {
    loadAccess,
    findCongregationDenominationId,
  };
  return {
    resolver: new TenantContextResolver(reader),
    loadAccess,
    findCongregationDenominationId,
  };
}

const resolve = (resolver: TenantContextResolver, rawScope: string) =>
  resolver.resolve({ userId: 5, sessionId: 'sid', rawScope });

describe('TenantContextResolver', () => {
  it('resolves the platform scope for a platform administrator', async () => {
    const { resolver } = createResolver({ assignments: [platformAdmin] });

    const context = await resolve(resolver, 'P');

    expect(context.kind).toBe('PLATFORM');
    expect(context.denominationId).toBeNull();
    expect(context.has('denominations.manage')).toBe(true);
  });

  it('never gives the platform scope to a tenant role', async () => {
    const { resolver } = createResolver({ assignments: [denominationAdmin] });

    await expect(resolve(resolver, 'P')).rejects.toBeInstanceOf(
      ForbiddenDomainException,
    );
  });

  it('never gives a tenant scope to a platform administrator', async () => {
    const { resolver } = createResolver({ assignments: [platformAdmin] });

    await expect(resolve(resolver, 'D:1')).rejects.toBeInstanceOf(
      ForbiddenDomainException,
    );
    await expect(resolve(resolver, 'C:10')).rejects.toBeInstanceOf(
      ForbiddenDomainException,
    );
  });

  it('resolves a denomination scope for its administrator only', async () => {
    const { resolver } = createResolver({ assignments: [denominationAdmin] });

    const context = await resolve(resolver, 'D:1');
    expect(context.denominationId).toBe(1);
    expect(context.congregationId).toBeNull();

    await expect(resolve(resolver, 'D:2')).rejects.toBeInstanceOf(
      ForbiddenDomainException,
    );
  });

  it('lets a denomination administrator act in any congregation of the denomination', async () => {
    const { resolver } = createResolver({ assignments: [denominationAdmin] });

    const context = await resolve(resolver, 'C:11');

    expect(context.kind).toBe('CONGREGATION');
    expect(context.denominationId).toBe(1);
    expect(context.congregationId).toBe(11);
    expect(context.has('congregations.manage')).toBe(true);
  });

  it('rejects a congregation of another denomination, with the same answer as a missing one', async () => {
    const { resolver } = createResolver({ assignments: [denominationAdmin] });

    const otherTenant = await resolve(resolver, 'C:20').catch(
      (e: unknown) => e,
    );
    const missing = await resolve(resolver, 'C:999').catch((e: unknown) => e);

    expect(otherTenant).toBeInstanceOf(ForbiddenDomainException);
    expect(missing).toBeInstanceOf(ForbiddenDomainException);
    expect((otherTenant as ForbiddenDomainException).code).toBe(
      (missing as ForbiddenDomainException).code,
    );
  });

  it('keeps a congregation role inside its congregation', async () => {
    const { resolver, findCongregationDenominationId } = createResolver({
      assignments: [treasurer],
    });

    const context = await resolve(resolver, 'C:10');
    expect(context.denominationId).toBe(1);
    // The congregation is known from the assignment: no extra query.
    expect(findCongregationDenominationId).not.toHaveBeenCalled();

    await expect(resolve(resolver, 'C:11')).rejects.toBeInstanceOf(
      ForbiddenDomainException,
    );
    await expect(resolve(resolver, 'D:1')).rejects.toBeInstanceOf(
      ForbiddenDomainException,
    );
  });

  it('unites the permissions of every role covering the scope', async () => {
    const { resolver } = createResolver({
      assignments: [treasurer, secretary, denominationAdmin],
    });

    const context = await resolve(resolver, 'C:10');

    expect(new Set(context.roleCodes)).toEqual(
      new Set(['TREASURER', 'SECRETARY', 'DENOMINATION_ADMIN']),
    );
    expect(
      context.hasAll(
        'contributions.write',
        'members.write',
        'congregations.manage',
      ),
    ).toBe(true);
    expect(context.has('denominations.manage')).toBe(false);
  });

  it('does not leak the permissions of a role at another scope', async () => {
    const { resolver } = createResolver({
      assignments: [treasurer, denominationAdmin],
    });

    const context = await resolve(resolver, 'D:1');

    expect(context.has('contributions.write')).toBe(false);
  });

  it('rejects an unknown or disabled user with 401', async () => {
    await expect(
      resolve(createResolver(null).resolver, 'P'),
    ).rejects.toBeInstanceOf(UnauthenticatedException);
    await expect(
      resolve(
        createResolver({ isActive: false, assignments: [platformAdmin] })
          .resolver,
        'P',
      ),
    ).rejects.toBeInstanceOf(UnauthenticatedException);
  });

  it('rejects a malformed scope with 400 before touching the database', async () => {
    const { resolver, loadAccess } = createResolver({
      assignments: [platformAdmin],
    });

    await expect(resolve(resolver, 'D:abc')).rejects.toBeInstanceOf(
      InvalidInputException,
    );
    expect(loadAccess).not.toHaveBeenCalled();
  });

  it('rejects a user without assignments', async () => {
    const { resolver } = createResolver({ assignments: [] });

    await expect(resolve(resolver, 'C:10')).rejects.toBeInstanceOf(
      ForbiddenDomainException,
    );
  });
});
