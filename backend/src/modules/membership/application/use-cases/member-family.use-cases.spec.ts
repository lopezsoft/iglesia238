import { TENANT_A } from '../../../../../test/support/tenants.js';
import { describeCrossTenantIsolation } from '../../../../../test/support/cross-tenant.js';
import { NotFoundDomainException } from '../../../../common/errors/domain.exception.js';
import { commandContext } from '../testing/context.js';
import { buildMembershipFakes } from '../testing/in-memory-membership.js';
import {
  AddFamilyRelationUseCase,
  ListFamilyUseCase,
  RemoveFamilyRelationUseCase,
  inverseTypeOf,
} from './member-family.use-cases.js';

function setup() {
  const fakes = buildMembershipFakes();
  const { store } = fakes;
  const member = store.seedMember(1, 10, {
    person: { firstName: 'Ana', lastName: 'Rojas', sex: 'FEMALE' },
  });
  return {
    ...fakes,
    member,
    list: new ListFamilyUseCase(fakes.members, fakes.family),
    add: new AddFamilyRelationUseCase(
      fakes.members,
      fakes.persons,
      fakes.family,
      fakes.transactions,
      fakes.audit,
    ),
    remove: new RemoveFamilyRelationUseCase(
      fakes.members,
      fakes.family,
      fakes.transactions,
      fakes.audit,
    ),
  };
}

describe('inverseTypeOf', () => {
  it('mirrors parents, children and nothing for guardians', () => {
    expect(inverseTypeOf('FATHER', 'FEMALE')).toBe('CHILD');
    expect(inverseTypeOf('MOTHER', null)).toBe('CHILD');
    expect(inverseTypeOf('CHILD', 'MALE')).toBe('FATHER');
    expect(inverseTypeOf('CHILD', 'FEMALE')).toBe('MOTHER');
    expect(inverseTypeOf('CHILD', null)).toBeNull();
    expect(inverseTypeOf('GUARDIAN', 'MALE')).toBeNull();
  });
});

describe('family relations', () => {
  it('adds a relation in both directions and audits only the type', async () => {
    const { add, list, member, store } = setup();
    const father = store.seedPerson({ denominationId: 1, firstName: 'Luis' });

    await add.execute(commandContext(TENANT_A), member.id, {
      relativeId: father.id,
      type: 'FATHER',
    });

    const mine = await list.execute(TENANT_A, member.id);
    expect(mine).toMatchObject([{ relativeId: father.id, type: 'FATHER' }]);
    expect(mine[0].maskedDocument).toContain('····');
    expect(store.family).toContainEqual(
      expect.objectContaining({
        personId: father.id,
        relativeId: member.personId,
        type: 'CHILD',
      }),
    );
    expect(store.audit.at(-1)?.changes).toEqual({
      type: { from: null, to: 'FATHER' },
    });
  });

  it('rejects self relations, repeated relatives and a second father', async () => {
    const { add, member, store } = setup();
    const context = commandContext(TENANT_A);
    const first = store.seedPerson({ denominationId: 1 });
    const second = store.seedPerson({ denominationId: 1 });
    await add.execute(context, member.id, {
      relativeId: first.id,
      type: 'FATHER',
    });

    await expect(
      add.execute(context, member.id, {
        relativeId: member.personId,
        type: 'CHILD',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RELATION' });
    await expect(
      add.execute(context, member.id, {
        relativeId: first.id,
        type: 'GUARDIAN',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_RELATION' });
    await expect(
      add.execute(context, member.id, {
        relativeId: second.id,
        type: 'FATHER',
      }),
    ).rejects.toMatchObject({ code: 'PARENT_ALREADY_SET' });
  });

  it('does not offer a second parent to the relative either', async () => {
    const { add, member, store } = setup();
    const context = commandContext(TENANT_A);
    const child = store.seedPerson({ denominationId: 1 });
    store.family.push({
      id: 999,
      denominationId: 1,
      personId: child.id,
      relativeId: store.seedPerson({ denominationId: 1 }).id,
      type: 'MOTHER',
    });

    // Ana (female) would become the MOTHER of the child, who already has one.
    await expect(
      add.execute(context, member.id, { relativeId: child.id, type: 'CHILD' }),
    ).rejects.toMatchObject({ code: 'PARENT_ALREADY_SET' });
  });

  it('removes a relation together with its inverse', async () => {
    const { add, remove, member, store } = setup();
    const context = commandContext(TENANT_A);
    const son = store.seedPerson({ denominationId: 1 });
    await add.execute(context, member.id, {
      relativeId: son.id,
      type: 'CHILD',
    });
    expect(store.family).toHaveLength(2);

    const row = store.family.find((item) => item.personId === member.personId);
    await remove.execute(context, member.id, row!.id);

    expect(store.family).toHaveLength(0);
    await expect(
      remove.execute(context, member.id, row!.id),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('never links a person of another denomination', async () => {
    const { add, member, store } = setup();
    const foreign = store.seedPerson({ denominationId: 2 });

    await expect(
      add.execute(commandContext(TENANT_A), member.id, {
        relativeId: foreign.id,
        type: 'CHILD',
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  const fixture = setup();
  describeCrossTenantIsolation('ListFamilyUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) => fixture.list.execute(scope, id),
  });
  describeCrossTenantIsolation('AddFamilyRelationUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) => {
      const relative = fixture.store.seedPerson({
        denominationId: scope.denominationId,
      });
      return fixture.add.execute(commandContext(scope), id, {
        relativeId: relative.id,
        type: 'GUARDIAN',
      });
    },
  });
  describeCrossTenantIsolation('RemoveFamilyRelationUseCase', {
    arrange: (owner) => {
      const member = fixture.store.seedMember(
        owner.denominationId,
        owner.congregationId ?? 10,
      );
      const relative = fixture.store.seedPerson({
        denominationId: owner.denominationId,
      });
      const relationId = fixture.store.nextId();
      fixture.store.family.push({
        id: relationId,
        denominationId: owner.denominationId,
        personId: member.personId,
        relativeId: relative.id,
        type: 'GUARDIAN',
      });
      return { memberId: member.id, relationId };
    },
    act: (scope, { memberId, relationId }) =>
      fixture.remove.execute(commandContext(scope), memberId, relationId),
  });
});
