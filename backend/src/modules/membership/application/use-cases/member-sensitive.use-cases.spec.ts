import { TENANT_A } from '../../../../../test/support/tenants.js';
import { describeCrossTenantIsolation } from '../../../../../test/support/cross-tenant.js';
import { commandContext } from '../testing/context.js';
import { buildMembershipFakes } from '../testing/in-memory-membership.js';
import {
  AnonymizeMemberUseCase,
  GetSocioeconomicProfileUseCase,
  ListConsentsUseCase,
  RevokeConsentUseCase,
  SaveSocioeconomicProfileUseCase,
} from './member-sensitive.use-cases.js';

const PROFILE = {
  hasHealthCoverage: true,
  hasPension: false,
  hasOccupationalRiskCoverage: null,
  isSubsidizedRegime: true,
  hasFamilyCompensation: null,
  sisbenLevel: 2,
  isDisplaced: false,
};

function setup() {
  const fakes = buildMembershipFakes();
  const { store } = fakes;
  store.policies.push({
    id: 1,
    denominationId: 1,
    version: '1.0',
    effectiveFrom: '2025-01-01',
    published: true,
  });
  const member = store.seedMember(1, 10, {
    person: { firstName: 'Ana', lastName: 'Rojas' },
  });
  const consentId = store.nextId();
  store.consents.push({
    id: consentId,
    denominationId: 1,
    personId: member.personId,
    guardianId: null,
    policyId: 1,
    channel: 'PAPER',
    grantedAt: new Date('2026-01-01T10:00:00.000Z'),
    revokedAt: null,
  });
  return {
    ...fakes,
    member,
    consentId,
    getProfile: new GetSocioeconomicProfileUseCase(
      fakes.members,
      fakes.profiles,
      fakes.audit,
    ),
    saveProfile: new SaveSocioeconomicProfileUseCase(
      fakes.members,
      fakes.profiles,
      fakes.transactions,
      fakes.audit,
    ),
    listConsents: new ListConsentsUseCase(fakes.members, fakes.consents),
    revoke: new RevokeConsentUseCase(
      fakes.members,
      fakes.consents,
      fakes.transactions,
      fakes.audit,
      fakes.clock,
    ),
    anonymize: new AnonymizeMemberUseCase(
      fakes.members,
      fakes.persons,
      fakes.consents,
      fakes.transactions,
      fakes.audit,
    ),
  };
}

describe('socioeconomic profile', () => {
  it('saves the profile and audits without any of its values', async () => {
    const { saveProfile, getProfile, member, store } = setup();
    const context = commandContext(TENANT_A);

    const saved = await saveProfile.execute(context, member.id, PROFILE);

    expect(saved.sisbenLevel).toBe(2);
    expect(store.audit.at(-1)).toMatchObject({
      entity: 'SocioeconomicProfile',
      action: 'UPDATED',
    });
    expect(store.audit.at(-1)?.changes).toBeUndefined();
    expect(await getProfile.execute(context, member.id)).toMatchObject({
      hasHealthCoverage: true,
    });
  });

  it('audits every read and answers null when it was never filled', async () => {
    const { getProfile, member, store } = setup();

    const profile = await getProfile.execute(
      commandContext(TENANT_A),
      member.id,
    );

    expect(profile).toBeNull();
    expect(store.audit.at(-1)).toMatchObject({
      action: 'SOCIOECONOMIC_PROFILE_VIEWED',
    });
  });

  it('validates the SISBEN level', async () => {
    const { saveProfile, member } = setup();

    await expect(
      saveProfile.execute(commandContext(TENANT_A), member.id, {
        ...PROFILE,
        sisbenLevel: 9,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  const fixture = setup();
  describeCrossTenantIsolation('GetSocioeconomicProfileUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) => fixture.getProfile.execute(commandContext(scope), id),
  });
  describeCrossTenantIsolation('SaveSocioeconomicProfileUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) =>
      fixture.saveProfile.execute(commandContext(scope), id, PROFILE),
  });
});

describe('consents', () => {
  it('revokes a consent once, keeps it as evidence and audits it', async () => {
    const { revoke, listConsents, member, consentId, store } = setup();
    const context = commandContext(TENANT_A);

    await revoke.execute(context, member.id, consentId);

    const [consent] = await listConsents.execute(TENANT_A, member.id);
    expect(consent.revokedAt).not.toBeNull();
    expect(store.audit.at(-1)).toMatchObject({
      entity: 'DataConsent',
      action: 'CONSENT_REVOKED',
      changes: { anonymizationPending: { from: false, to: true } },
    });
    await expect(
      revoke.execute(context, member.id, consentId),
    ).rejects.toMatchObject({
      code: 'ALREADY_REVOKED',
    });
  });

  it('does not revoke the consent of another person', async () => {
    const { revoke, member, store } = setup();
    const other = store.seedMember(1, 10);
    const foreignConsent = store.nextId();
    store.consents.push({
      id: foreignConsent,
      denominationId: 1,
      personId: other.personId,
      guardianId: null,
      policyId: 1,
      channel: 'PAPER',
      grantedAt: new Date(),
      revokedAt: null,
    });

    await expect(
      revoke.execute(commandContext(TENANT_A), member.id, foreignConsent),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  const fixture = setup();
  describeCrossTenantIsolation('ListConsentsUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) => fixture.listConsents.execute(scope, id),
  });
  describeCrossTenantIsolation('RevokeConsentUseCase', {
    arrange: (owner) => {
      const member = fixture.store.seedMember(
        owner.denominationId,
        owner.congregationId ?? 10,
      );
      const consentId = fixture.store.nextId();
      fixture.store.consents.push({
        id: consentId,
        denominationId: owner.denominationId,
        personId: member.personId,
        guardianId: null,
        policyId: 1,
        channel: 'PAPER',
        grantedAt: new Date(),
        revokedAt: null,
      });
      return { memberId: member.id, consentId };
    },
    act: (scope, { memberId, consentId }) =>
      fixture.revoke.execute(commandContext(scope), memberId, consentId),
  });
});

describe('AnonymizeMemberUseCase', () => {
  it('removes the personal data once every consent was revoked and the member is not active', async () => {
    const { anonymize, revoke, member, consentId, store } = setup();
    const context = commandContext(TENANT_A);

    await expect(anonymize.execute(context, member.id)).rejects.toMatchObject({
      code: 'MEMBER_STILL_ACTIVE',
    });
    store.members[0].status = 'INACTIVE';
    await expect(anonymize.execute(context, member.id)).rejects.toMatchObject({
      code: 'CONSENT_IN_FORCE',
    });

    await revoke.execute(context, member.id, consentId);
    await anonymize.execute(context, member.id);

    expect(
      store.persons.find((row) => row.id === member.personId),
    ).toMatchObject({
      anonymized: true,
      documentNumber: null,
    });
    const entry = store.audit.at(-1);
    expect(entry).toMatchObject({
      action: 'PERSON_ANONYMIZED',
      entity: 'Person',
    });
    expect(entry?.changes).toBeUndefined();
  });

  it('does not anonymize a person who has a user account', async () => {
    const { anonymize, member, store } = setup();
    store.persons[0].userId = 9;
    store.members[0].status = 'INACTIVE';

    await expect(
      anonymize.execute(commandContext(TENANT_A), member.id),
    ).rejects.toMatchObject({
      code: 'PERSON_HAS_USER',
    });
  });

  const fixture = setup();
  describeCrossTenantIsolation('AnonymizeMemberUseCase', {
    arrange: (owner) => {
      const member = fixture.store.seedMember(
        owner.denominationId,
        owner.congregationId ?? 10,
        {
          status: 'INACTIVE',
        },
      );
      fixture.store.consents.push({
        id: fixture.store.nextId(),
        denominationId: owner.denominationId,
        personId: member.personId,
        guardianId: null,
        policyId: 1,
        channel: 'PAPER',
        grantedAt: new Date(),
        revokedAt: new Date(),
      });
      return member.id;
    },
    act: (scope, id) => fixture.anonymize.execute(commandContext(scope), id),
  });
});
