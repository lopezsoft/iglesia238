import {
  TENANT_A,
  TENANT_A_WIDE,
  TENANT_B,
} from '../../../../../test/support/tenants.js';
import { describeCrossTenantIsolation } from '../../../../../test/support/cross-tenant.js';
import {
  BusinessRuleException,
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../../common/errors/domain.exception.js';
import type { PersonData } from '../member.models.js';
import { commandContext } from '../testing/context.js';
import { buildMembershipFakes } from '../testing/in-memory-membership.js';
import {
  CreateMemberInput,
  CreateMemberUseCase,
} from './create-member.use-case.js';

const PERSON: PersonData = {
  firstName: 'Marta',
  lastName: 'Castillo',
  secondLastName: null,
  documentTypeCode: 'CC',
  documentNumber: '52.123.456',
  birthDate: '1985-04-12',
  sex: 'FEMALE',
  maritalStatusCode: null,
  educationLevelCode: null,
  profession: null,
  occupation: null,
  phone: '300 555 0000',
  email: null,
  address: null,
  municipalityCode: null,
};

function input(overrides: Partial<CreateMemberInput> = {}): CreateMemberInput {
  return {
    congregationId: null,
    existingPersonId: null,
    person: PERSON,
    joinedOn: null,
    isBaptized: null,
    waterBaptismOn: null,
    baptismPlace: null,
    previousCongregationName: null,
    registryBook: null,
    registryFolio: null,
    guardianPersonId: null,
    consentAccepted: true,
    ...overrides,
  };
}

function setup() {
  const fakes = buildMembershipFakes();
  for (const [id, denominationId] of [
    [1, 1],
    [2, 2],
  ]) {
    fakes.store.policies.push({
      id,
      denominationId,
      version: '1.0',
      effectiveFrom: '2025-01-01',
      published: true,
    });
  }
  const create = new CreateMemberUseCase(
    fakes.members,
    fakes.persons,
    fakes.catalogs,
    fakes.registry,
    fakes.consents,
    fakes.family,
    fakes.transactions,
    fakes.audit,
    fakes.numbering,
    fakes.clock,
  );
  return { ...fakes, create };
}

describe('CreateMemberUseCase', () => {
  it('creates the person, the member, the registry entry, the history and the paper consent together', async () => {
    const { create, store } = setup();

    const detail = await create.execute(commandContext(TENANT_A), input());

    expect(detail).toMatchObject({
      code: 'SC-0001',
      status: 'ACTIVE',
      joinedOn: '2026-11-02',
      congregationId: 10,
    });
    expect(detail.person).toMatchObject({
      firstName: 'Marta',
      documentNumber: '52123456',
    });
    expect(
      store.registry.filter((row) => row.memberId === detail.id),
    ).toHaveLength(1);
    expect(store.histories.at(-1)).toMatchObject({
      status: 'ACTIVE',
      reason: 'Registro manual',
      userId: 7,
    });
    expect(store.consents.at(-1)).toMatchObject({
      channel: 'PAPER',
      policyId: 1,
      revokedAt: null,
    });
    expect(store.audit.at(-1)).toMatchObject({
      action: 'MEMBER_CREATED',
      changes: {
        status: { from: null, to: 'ACTIVE' },
        memberNumber: { from: null, to: 1 },
      },
    });
    expect(JSON.stringify(store.audit.at(-1))).not.toContain('52123456');
  });

  it('numbers the members of a congregation consecutively', async () => {
    const { create } = setup();
    await create.execute(commandContext(TENANT_A), input());

    const second = await create.execute(
      commandContext(TENANT_A),
      input({ person: { ...PERSON, documentNumber: '777888' } }),
    );

    expect(second.code).toBe('SC-0002');
  });

  it('asks a denomination scope for the congregation and fixes it for a congregation scope', async () => {
    const { create } = setup();

    await expect(
      create.execute(commandContext(TENANT_A_WIDE), input()),
    ).rejects.toMatchObject({
      code: 'CONGREGATION_SCOPE_REQUIRED',
    });
    const wide = await create.execute(
      commandContext(TENANT_A_WIDE),
      input({ congregationId: 11 }),
    );
    expect(wide.congregationId).toBe(11);
    await expect(
      create.execute(
        commandContext(TENANT_A),
        input({
          congregationId: 11,
          person: { ...PERSON, documentNumber: '1112223' },
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('requires the signed consent and a published policy', async () => {
    const { create, store } = setup();

    await expect(
      create.execute(
        commandContext(TENANT_A),
        input({ consentAccepted: false }),
      ),
    ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });

    store.policies[0].published = false;
    await expect(
      create.execute(commandContext(TENANT_A), input()),
    ).rejects.toMatchObject({
      code: 'POLICY_NOT_PUBLISHED',
    });
  });

  it('refuses a document that already belongs to a member, and points to the existing non-member', async () => {
    const { create, store } = setup();
    store.seedMember(1, 11, { person: { documentNumber: '52123456' } });
    await expect(
      create.execute(commandContext(TENANT_A), input()),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_DOCUMENT',
    });

    store.members.length = 0;
    await expect(
      create.execute(commandContext(TENANT_A), input()),
    ).rejects.toMatchObject({
      code: 'PERSON_EXISTS',
    });
  });

  it('registers an existing person as a member, once', async () => {
    const { create, store } = setup();
    const relative = store.seedPerson({
      denominationId: 1,
      firstName: 'Pedro',
      birthDate: '1970-02-02',
    });

    const detail = await create.execute(
      commandContext(TENANT_A),
      input({ existingPersonId: relative.id, person: null }),
    );
    expect(detail.person.id).toBe(relative.id);

    await expect(
      create.execute(
        commandContext(TENANT_A),
        input({ existingPersonId: relative.id, person: null }),
      ),
    ).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
  });

  it('requires a guardian for a minor and links them', async () => {
    const { create, store } = setup();
    const minor = {
      ...PERSON,
      firstName: 'Niño',
      documentNumber: '1100',
      birthDate: '2015-03-03',
    };
    const guardian = store.seedPerson({
      denominationId: 1,
      firstName: 'Madre',
    });

    await expect(
      create.execute(commandContext(TENANT_A), input({ person: minor })),
    ).rejects.toMatchObject({ code: 'GUARDIAN_REQUIRED' });

    const detail = await create.execute(
      commandContext(TENANT_A),
      input({ person: minor, guardianPersonId: guardian.id }),
    );
    expect(store.consents.at(-1)?.guardianId).toBe(guardian.id);
    expect(store.family).toContainEqual(
      expect.objectContaining({
        personId: detail.person.id,
        relativeId: guardian.id,
        type: 'GUARDIAN',
      }),
    );
  });

  it('refuses inactive congregations and invalid dates', async () => {
    const { create, store } = setup();
    store.seedCongregation(12, 1, 'SX', false);

    await expect(
      create.execute(
        commandContext(TENANT_A_WIDE),
        input({ congregationId: 12 }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleException);
    await expect(
      create.execute(
        commandContext(TENANT_A),
        input({ joinedOn: '2999-01-01' }),
      ),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });

  it('never reaches a congregation or a person of another denomination', async () => {
    const { create, store } = setup();
    const foreignPerson = store.seedPerson({ denominationId: 2 });

    await expect(
      create.execute(
        commandContext(TENANT_A_WIDE),
        input({ congregationId: 20 }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      create.execute(
        commandContext(TENANT_A),
        input({ existingPersonId: foreignPerson.id, person: null }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      create.execute(commandContext(TENANT_B), input({ congregationId: 10 })),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('does not translate a duplicate into a different error type', async () => {
    const { create, store } = setup();
    store.seedMember(1, 10, { person: { documentNumber: '52123456' } });

    await expect(
      create.execute(commandContext(TENANT_A), input()),
    ).rejects.toBeInstanceOf(ConflictDomainException);
  });

  const fixture = setup();
  describeCrossTenantIsolation('CreateMemberUseCase (existing person)', {
    congregationLevel: false,
    arrange: (owner) =>
      fixture.store.seedPerson({ denominationId: owner.denominationId }).id,
    act: (scope, personId) =>
      fixture.create.execute(
        commandContext(scope),
        input({ existingPersonId: personId, person: null }),
      ),
  });
});
