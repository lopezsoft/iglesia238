import { TENANT_A } from '../../../../../test/support/tenants.js';
import { describeCrossTenantIsolation } from '../../../../../test/support/cross-tenant.js';
import {
  ConflictDomainException,
  InvalidInputException,
} from '../../../../common/errors/domain.exception.js';
import type { PersonData } from '../member.models.js';
import { commandContext } from '../testing/context.js';
import { buildMembershipFakes } from '../testing/in-memory-membership.js';
import {
  UpdateMemberPersonUseCase,
  UpdateMembershipDataUseCase,
} from './member-profile.use-cases.js';

function setup() {
  const fakes = buildMembershipFakes();
  const { store } = fakes;
  const member = store.seedMember(1, 10, {
    person: { firstName: 'Ana', lastName: 'Rojas', documentNumber: '52418916' },
  });
  const updatePerson = new UpdateMemberPersonUseCase(
    fakes.members,
    fakes.persons,
    fakes.catalogs,
    fakes.transactions,
    fakes.audit,
    fakes.clock,
  );
  const updateMembership = new UpdateMembershipDataUseCase(
    fakes.members,
    fakes.transactions,
    fakes.audit,
    fakes.clock,
  );
  return { ...fakes, member, updatePerson, updateMembership };
}

function personData(overrides: Partial<PersonData> = {}): PersonData {
  return {
    firstName: 'Ana',
    lastName: 'Rojas',
    secondLastName: null,
    documentTypeCode: 'CC',
    documentNumber: '52.418.916',
    birthDate: '1989-01-01',
    sex: 'FEMALE',
    maritalStatusCode: null,
    educationLevelCode: null,
    profession: null,
    occupation: null,
    phone: null,
    email: null,
    address: null,
    municipalityCode: null,
    ...overrides,
  };
}

describe('UpdateMemberPersonUseCase', () => {
  it('normalizes and saves the person, and audits only the names of the changed fields', async () => {
    const { updatePerson, member, store } = setup();

    const detail = await updatePerson.execute(
      commandContext(TENANT_A),
      member.id,
      personData({ phone: '300 555 7777', email: 'ANA@Example.COM ' }),
    );

    expect(detail.person.phone).toBe('300 555 7777');
    expect(detail.person.email).toBe('ana@example.com');
    expect(detail.person.documentNumber).toBe('52418916');
    const entry = store.audit.at(-1);
    expect(entry).toMatchObject({ entity: 'Person', action: 'UPDATED' });
    expect(JSON.stringify(entry?.changes)).not.toContain('300 555 7777');
    expect(JSON.stringify(entry?.changes)).not.toContain('ana@example.com');
    expect(entry?.changes).toEqual({
      fields: { from: null, to: expect.stringContaining('phone') as unknown },
    });
  });

  it('rejects a document another person of the denomination already has, without revealing it', async () => {
    const { updatePerson, member, store } = setup();
    store.seedMember(1, 11, { person: { documentNumber: '99887766' } });

    const attempt = updatePerson.execute(
      commandContext(TENANT_A),
      member.id,
      personData({ documentNumber: '99887766' }),
    );

    await expect(attempt).rejects.toBeInstanceOf(ConflictDomainException);
    await expect(attempt).rejects.toMatchObject({ code: 'DUPLICATE_DOCUMENT' });
    await expect(attempt).rejects.not.toThrow('99887766');
  });

  it('allows a document that only exists in another denomination', async () => {
    const { updatePerson, member, store } = setup();
    store.seedMember(2, 20, { person: { documentNumber: '99887766' } });

    const detail = await updatePerson.execute(
      commandContext(TENANT_A),
      member.id,
      personData({ documentNumber: '99887766' }),
    );

    expect(detail.person.documentNumber).toBe('99887766');
  });

  it('keeps document type and number together, and validates dates and e-mail', async () => {
    const { updatePerson, member } = setup();
    const run = (overrides: Partial<PersonData>) =>
      updatePerson.execute(
        commandContext(TENANT_A),
        member.id,
        personData(overrides),
      );

    await expect(run({ documentNumber: null })).rejects.toBeInstanceOf(
      InvalidInputException,
    );
    await expect(run({ birthDate: '2999-01-01' })).rejects.toMatchObject({
      code: 'INVALID_DATE',
    });
    await expect(run({ email: 'not-an-email' })).rejects.toBeInstanceOf(
      InvalidInputException,
    );
    await expect(run({ documentTypeCode: 'XX' })).rejects.toBeInstanceOf(
      InvalidInputException,
    );
  });

  const fixture = setup();
  describeCrossTenantIsolation('UpdateMemberPersonUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) =>
      fixture.updatePerson.execute(
        commandContext(scope),
        id,
        personData({ documentTypeCode: null, documentNumber: null }),
      ),
  });
});

describe('UpdateMembershipDataUseCase', () => {
  it('saves the baptism data and audits the field differences', async () => {
    const { updateMembership, member, store } = setup();

    const detail = await updateMembership.execute(
      commandContext(TENANT_A),
      member.id,
      {
        isBaptized: true,
        waterBaptismOn: '2015-06-14',
        baptismPlace: ' Río Magdalena ',
      },
    );

    expect(detail).toMatchObject({
      isBaptized: true,
      waterBaptismOn: '2015-06-14',
      baptismPlace: 'Río Magdalena',
    });
    expect(store.audit.at(-1)?.changes).toMatchObject({
      isBaptized: { from: null, to: true },
      waterBaptismOn: { from: null, to: '2015-06-14' },
    });
  });

  it('rejects future dates and a baptism date for someone who is not baptized', async () => {
    const { updateMembership, member } = setup();
    const run = (
      patch: Parameters<UpdateMembershipDataUseCase['execute']>[2],
    ) => updateMembership.execute(commandContext(TENANT_A), member.id, patch);

    await expect(run({ joinedOn: '2999-01-01' })).rejects.toMatchObject({
      code: 'INVALID_DATE',
    });
    await expect(
      run({ isBaptized: false, waterBaptismOn: '2015-06-14' }),
    ).rejects.toMatchObject({
      code: 'INVALID_BAPTISM',
    });
  });

  const fixture = setup();
  describeCrossTenantIsolation('UpdateMembershipDataUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) =>
      fixture.updateMembership.execute(commandContext(scope), id, {
        baptismPlace: 'Iglesia',
      }),
  });
});
