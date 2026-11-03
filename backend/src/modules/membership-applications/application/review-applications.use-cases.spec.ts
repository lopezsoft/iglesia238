import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import {
  FixedClock,
  RecordingAuditRecorder,
} from '../../../../test/support/foundation-fakes.js';
import {
  TENANT_A,
  TENANT_A_WIDE,
  TENANT_B,
  buildTenantContext,
} from '../../../../test/support/tenants.js';
import {
  BusinessRuleException,
  ConflictDomainException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import { DocumentNumberingService } from '../../../common/numbering/document-numbering.service.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { parseFormData } from '../domain/application-form-data.js';
import { ApplicationAssembler } from './application.assembler.js';
import { ApproveApplicationUseCase } from './approve-application.use-case.js';
import { GetApplicationUseCase } from './get-application.use-case.js';
import { ListApplicationsUseCase } from './list-applications.use-case.js';
import { MarkDuplicateUseCase } from './mark-duplicate.use-case.js';
import { RejectApplicationUseCase } from './reject-application.use-case.js';
import { StartReviewUseCase } from './start-review.use-case.js';
import {
  FakeApplicationsRepository,
  FakeMembershipRegistry,
  RollbackTransactionRunner,
  World,
  buildApplication,
  buildPerson,
} from './testing/in-memory-world.js';
import { InMemorySequenceStore } from './testing/in-memory-sequences.js';

function contextOf(scope: TenantScope) {
  return buildTenantContext({
    kind: scope.congregationId === null ? 'DENOMINATION' : 'CONGREGATION',
    denominationId: scope.denominationId,
    congregationId: scope.congregationId,
    userId: 7,
  });
}

function setup() {
  const world = new World();
  const applications = new FakeApplicationsRepository(world);
  const registry = new FakeMembershipRegistry(world);
  const transactions = new RollbackTransactionRunner(world);
  const audit = new RecordingAuditRecorder();
  const clock = new FixedClock(); // 2026-11-02 10:00 in Bogota
  const sequences = new InMemorySequenceStore();
  const numbering = new DocumentNumberingService(sequences, transactions);
  const assembler = new ApplicationAssembler(registry, clock);
  return {
    world,
    audit,
    list: new ListApplicationsUseCase(applications, assembler),
    get: new GetApplicationUseCase(applications, assembler),
    startReview: new StartReviewUseCase(
      applications,
      transactions,
      audit,
      assembler,
    ),
    reject: new RejectApplicationUseCase(
      applications,
      transactions,
      audit,
      assembler,
      clock,
    ),
    markDuplicate: new MarkDuplicateUseCase(
      applications,
      registry,
      transactions,
      audit,
      assembler,
      clock,
    ),
    approve: new ApproveApplicationUseCase(
      applications,
      registry,
      transactions,
      audit,
      numbering,
      clock,
    ),
  };
}

const REVIEWER = contextOf(TENANT_A);
const REVIEWER_WIDE = contextOf(TENANT_A_WIDE);

describe('ListApplicationsUseCase', () => {
  const query = {
    filter: 'PENDING' as const,
    search: null,
    congregationId: null,
    from: null,
    to: null,
    order: 'desc' as const,
    page: 1,
    pageSize: 10,
  };

  it('counts every chip and flags the applications whose document already belongs to a person', async () => {
    const { world, list } = setup();
    world.applications.push(
      buildApplication({ id: 1, documentNumber: '111' }),
      buildApplication({ id: 2, documentNumber: '222', status: 'IN_REVIEW' }),
      buildApplication({ id: 3, status: 'APPROVED' }),
      buildApplication({ id: 4, status: 'REJECTED' }),
    );
    world.people.push(buildPerson({ id: 50, documentNumber: '111' }));

    const result = await list.execute(REVIEWER, query);

    expect(result.counts).toEqual({
      PENDING: 2,
      DUPLICATE: 0,
      APPROVED: 1,
      REJECTED: 1,
      ALL: 4,
    });
    expect(result.items.map((item) => item.id).sort()).toEqual([1, 2]);
    expect(result.items.find((item) => item.id === 1)?.hasDuplicateMatch).toBe(
      true,
    );
    expect(result.items.find((item) => item.id === 2)?.hasDuplicateMatch).toBe(
      false,
    );
    expect(result.total).toBe(2);
    expect(result.items[0].fullName).toBe('Ana Pérez Gómez');
  });

  it('does not match persons of another denomination', async () => {
    const { world, list } = setup();
    world.applications.push(buildApplication({ id: 1, documentNumber: '111' }));
    world.people.push(
      buildPerson({ id: 50, documentNumber: '111', denominationId: 2 }),
    );

    const result = await list.execute(REVIEWER, query);

    expect(result.items[0].hasDuplicateMatch).toBe(false);
  });

  it('only shows the applications of the congregation of the reviewer', async () => {
    const { world, list } = setup();
    world.applications.push(
      buildApplication({ id: 1 }),
      buildApplication({ id: 2, congregationId: 11 }),
      buildApplication({ id: 3, denominationId: 2, congregationId: 20 }),
    );

    expect(
      (await list.execute(REVIEWER, query)).items.map((i) => i.id),
    ).toEqual([1]);
    const wide = await list.execute(REVIEWER_WIDE, query);
    expect(wide.items.map((i) => i.id).sort()).toEqual([1, 2]);
    expect(wide.counts.ALL).toBe(2);
  });

  it('answers 404 when a congregation reviewer asks for another congregation', async () => {
    const { list } = setup();

    await expect(
      list.execute(REVIEWER, { ...query, congregationId: 11 }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('refuses the platform scope', async () => {
    const { list } = setup();

    await expect(
      list.execute(buildTenantContext({ kind: 'PLATFORM' }), query),
    ).rejects.toMatchObject({ code: 'PLATFORM_SCOPE_NOT_ALLOWED' });
  });
});

describe('GetApplicationUseCase', () => {
  let shared = setup();
  beforeEach(() => {
    shared = setup();
  });

  describeCrossTenantIsolation('get application', {
    arrange: (owner) => {
      const application = buildApplication({
        denominationId: owner.denominationId,
        congregationId: owner.congregationId ?? 10,
      });
      shared.world.applications.push(application);
      return application.id;
    },
    act: (scope, id) => shared.get.execute(contextOf(scope), id),
  });

  it('shows the duplicate only while the application can still be resolved', async () => {
    const { world, get } = setup();
    world.people.push(buildPerson({ id: 50, documentNumber: '9' }));
    world.applications.push(
      buildApplication({ id: 1, documentNumber: '9' }),
      buildApplication({ id: 2, documentNumber: '9', status: 'REJECTED' }),
    );

    expect((await get.execute(REVIEWER, 1)).duplicateMatch?.personId).toBe(50);
    expect((await get.execute(REVIEWER, 2)).duplicateMatch).toBeNull();
  });

  it('computes the age and flags minors', async () => {
    const { world, get } = setup();
    world.applications.push(
      buildApplication({ id: 1, birthDate: '2010-11-03' }),
    );

    const detail = await get.execute(REVIEWER, 1);

    expect(detail.age).toBe(15);
    expect(detail.isMinor).toBe(true);
  });
});

describe('StartReviewUseCase', () => {
  let ctx = setup();
  beforeEach(() => {
    ctx = setup();
  });

  describeCrossTenantIsolation('start review', {
    arrange: (owner) => {
      const application = buildApplication({
        denominationId: owner.denominationId,
        congregationId: owner.congregationId ?? 10,
      });
      ctx.world.applications.push(application);
      return application.id;
    },
    act: (scope, id) => ctx.startReview.execute(contextOf(scope), id, null),
  });

  it('assigns the reviewer and audits without personal data', async () => {
    ctx.world.applications.push(buildApplication({ id: 1 }));

    const detail = await ctx.startReview.execute(REVIEWER, 1, '10.0.0.1');

    expect(detail.status).toBe('IN_REVIEW');
    expect(detail.reviewerName).toBe('Revisor 7');
    expect(ctx.audit.entries).toHaveLength(1);
    expect(ctx.audit.entries[0]).toMatchObject({
      action: 'APPLICATION_REVIEW_STARTED',
      entity: 'MembershipApplication',
      entityId: 1,
      congregationId: 10,
      changes: { status: { from: 'PENDING', to: 'IN_REVIEW' } },
      ipAddress: '10.0.0.1',
    });
  });

  it('only takes pending applications', async () => {
    ctx.world.applications.push(
      buildApplication({ id: 1, status: 'IN_REVIEW' }),
    );

    await expect(
      ctx.startReview.execute(REVIEWER, 1, null),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

describe('RejectApplicationUseCase', () => {
  let ctx = setup();
  beforeEach(() => {
    ctx = setup();
  });

  describeCrossTenantIsolation('reject application', {
    arrange: (owner) => {
      const application = buildApplication({
        denominationId: owner.denominationId,
        congregationId: owner.congregationId ?? 10,
      });
      ctx.world.applications.push(application);
      return application.id;
    },
    act: (scope, id) =>
      ctx.reject.execute(
        contextOf(scope),
        id,
        'El documento no coincide con el registro.',
        null,
      ),
  });

  it('stores the trimmed reason and keeps it out of the audit', async () => {
    ctx.world.applications.push(buildApplication({ id: 1 }));

    const detail = await ctx.reject.execute(
      REVIEWER,
      1,
      '  El documento no coincide con el registro.  ',
      null,
    );

    expect(detail.status).toBe('REJECTED');
    expect(detail.rejectionReason).toBe(
      'El documento no coincide con el registro.',
    );
    expect(JSON.stringify(ctx.audit.entries)).not.toContain(
      'documento no coincide',
    );
  });

  it.each([
    ['   ', 'REJECTION_REASON_REQUIRED'],
    ['corto', 'REJECTION_REASON_TOO_SHORT'],
    ['x'.repeat(256), 'REJECTION_REASON_TOO_LONG'],
  ])('validates the reason %#', async (reason, code) => {
    ctx.world.applications.push(buildApplication({ id: 1 }));

    await expect(
      ctx.reject.execute(REVIEWER, 1, reason, null),
    ).rejects.toMatchObject({ code });
    expect(ctx.world.applications[0].status).toBe('PENDING');
  });

  it('does not reject a resolved application', async () => {
    ctx.world.applications.push(
      buildApplication({ id: 1, status: 'APPROVED' }),
    );

    await expect(
      ctx.reject.execute(REVIEWER, 1, 'Motivo suficientemente largo', null),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

describe('MarkDuplicateUseCase', () => {
  let ctx = setup();
  beforeEach(() => {
    ctx = setup();
  });

  describeCrossTenantIsolation('mark duplicate', {
    arrange: (owner) => {
      const application = buildApplication({
        denominationId: owner.denominationId,
        congregationId: owner.congregationId ?? 10,
        documentNumber: '777',
      });
      ctx.world.applications.push(application);
      ctx.world.people.push(
        buildPerson({
          id: 900 + application.id,
          documentNumber: '777',
          denominationId: owner.denominationId,
        }),
      );
      return application.id;
    },
    act: (scope, id) =>
      ctx.markDuplicate.execute(contextOf(scope), id, 900 + id, null),
  });

  it('links the application to the person that holds the document', async () => {
    ctx.world.people.push(buildPerson({ id: 50, documentNumber: '9' }));
    ctx.world.applications.push(
      buildApplication({ id: 1, documentNumber: '9' }),
    );

    const detail = await ctx.markDuplicate.execute(REVIEWER, 1, 50, null);

    expect(detail.status).toBe('DUPLICATE');
    expect(detail.linkedPerson?.personId).toBe(50);
    expect(ctx.world.members).toHaveLength(0);
  });

  it('refuses a person that does not hold the document', async () => {
    ctx.world.people.push(
      buildPerson({ id: 50, documentNumber: '9' }),
      buildPerson({ id: 51, documentNumber: '10' }),
    );
    ctx.world.applications.push(
      buildApplication({ id: 1, documentNumber: '9' }),
    );

    await expect(
      ctx.markDuplicate.execute(REVIEWER, 1, 51, null),
    ).rejects.toMatchObject({ code: 'INVALID_MATCH' });
    expect(ctx.world.applications[0].status).toBe('PENDING');
  });
});

describe('ApproveApplicationUseCase', () => {
  let ctx = setup();
  beforeEach(() => {
    ctx = setup();
  });

  const NO_LINK = { linkToPersonId: null };

  describeCrossTenantIsolation('approve application', {
    arrange: (owner) => {
      const application = buildApplication({
        denominationId: owner.denominationId,
        congregationId: owner.congregationId ?? 10,
      });
      ctx.world.applications.push(application);
      return application.id;
    },
    act: (scope, id) =>
      ctx.approve.execute(contextOf(scope), id, NO_LINK, null),
  });

  it('creates person, member, registry entry, status and consent with the next member number', async () => {
    ctx.world.applications.push(
      buildApplication({ id: 1, documentNumber: '111' }),
      buildApplication({ id: 2, documentNumber: '222' }),
    );

    const first = await ctx.approve.execute(REVIEWER, 1, NO_LINK, '10.0.0.1');
    const second = await ctx.approve.execute(REVIEWER, 2, NO_LINK, null);

    expect(first).toMatchObject({
      applicationId: 1,
      memberNumber: 1,
      memberCode: 'SC-0001',
    });
    expect(second.memberNumber).toBe(2);
    expect(second.memberCode).toBe('SC-0002');

    const person = ctx.world.people[0];
    expect(person).toMatchObject({
      denominationId: 1,
      documentTypeCode: 'CC',
      documentNumber: '111',
      firstName: 'Ana',
      lastName: 'Pérez',
      secondLastName: 'Gómez',
      occupation: 'Docente',
      municipalityCode: '13001',
    });
    expect(ctx.world.members[0]).toMatchObject({
      personId: person.id,
      congregationId: 10,
      status: 'ACTIVE',
      joinedOn: '2026-11-02',
      isBaptized: true,
    });
    expect(ctx.world.entries[0]).toMatchObject({
      memberId: ctx.world.members[0].id,
      memberNumber: 1,
      registryBook: '1',
      registryFolio: '1',
      startedOn: '2026-11-02',
      endedOn: null,
    });
    expect(ctx.world.histories[0]).toMatchObject({
      status: 'ACTIVE',
      userId: 7,
    });
    expect(ctx.world.consents[0]).toMatchObject({
      personId: person.id,
      guardianId: null,
      policyId: 5,
      grantedAt: new Date('2026-10-30T15:00:00.000Z'),
    });
    expect(ctx.world.applications[0]).toMatchObject({
      status: 'APPROVED',
      memberId: ctx.world.members[0].id,
      matchedPersonId: null,
    });
  });

  it('audits the approval with no personal data', async () => {
    ctx.world.applications.push(buildApplication({ id: 1 }));

    await ctx.approve.execute(REVIEWER, 1, NO_LINK, '10.0.0.1');

    expect(ctx.audit.entries).toHaveLength(1);
    expect(ctx.audit.entries[0]).toMatchObject({
      action: 'APPLICATION_APPROVED',
      changes: {
        status: { from: 'PENDING', to: 'APPROVED' },
        memberNumber: { from: null, to: 1 },
      },
    });
    const text = JSON.stringify(ctx.audit.entries[0].changes);
    expect(text).not.toContain('Ana');
    expect(text).not.toContain('10001');
  });

  it('numbers each congregation on its own', async () => {
    ctx.world.applications.push(
      buildApplication({ id: 1 }),
      buildApplication({
        id: 2,
        congregationId: 11,
        congregationName: 'Sede Norte',
        congregationCode: 'SN',
      }),
    );

    const central = await ctx.approve.execute(REVIEWER_WIDE, 1, NO_LINK, null);
    const north = await ctx.approve.execute(REVIEWER_WIDE, 2, NO_LINK, null);

    expect(central.memberCode).toBe('SC-0001');
    expect(north.memberCode).toBe('SN-0001');
  });

  it('creates the guardian of a minor, links it and records who authorized the data', async () => {
    ctx.world.applications.push(
      buildApplication({
        id: 1,
        birthDate: '2014-03-10',
        guardianName: 'Marta Ruiz',
        guardianDocument: '52345678',
        formData: parseFormData({
          sex: 'MALE',
          maritalStatusCode: 'SINGLE',
          address: 'Calle 1',
          municipalityCode: '13001',
          guardian: {
            firstName: 'Marta',
            lastName: 'Ruiz',
            documentTypeCode: 'CC',
            documentNumber: '52345678',
            relationship: 'Madre',
            phone: '3009999999',
          },
        }),
      }),
    );

    await ctx.approve.execute(REVIEWER, 1, NO_LINK, null);

    const child = ctx.world.people.find((p) => p.documentNumber === '10001');
    const guardian = ctx.world.people.find(
      (p) => p.documentNumber === '52345678',
    );
    expect(guardian).toMatchObject({
      firstName: 'Marta',
      lastName: 'Ruiz',
      phone: '3009999999',
    });
    expect(ctx.world.relations).toEqual([
      { denominationId: 1, personId: child?.id, relativeId: guardian?.id },
    ]);
    expect(ctx.world.consents[0].guardianId).toBe(guardian?.id);
  });

  it('reuses a guardian the denomination already knows', async () => {
    ctx.world.people.push(
      buildPerson({
        id: 60,
        documentNumber: '52345678',
        firstName: 'Marta',
        lastName: 'Ruiz',
      }),
    );
    ctx.world.applications.push(
      buildApplication({
        id: 1,
        birthDate: '2014-03-10',
        formData: parseFormData({
          sex: 'MALE',
          guardian: {
            firstName: 'Marta',
            lastName: 'Ruiz',
            documentTypeCode: 'CC',
            documentNumber: '52.345.678',
            relationship: 'Madre',
            phone: '3009999999',
          },
        }),
      }),
    );

    await ctx.approve.execute(REVIEWER, 1, NO_LINK, null);

    expect(
      ctx.world.people.filter((p) => p.documentNumber === '52345678'),
    ).toHaveLength(1);
    expect(ctx.world.consents[0].guardianId).toBe(60);
  });

  it('refuses a minor without a guardian and saves nothing', async () => {
    ctx.world.applications.push(
      buildApplication({ id: 1, birthDate: '2014-03-10' }),
    );

    await expect(
      ctx.approve.execute(REVIEWER, 1, NO_LINK, null),
    ).rejects.toMatchObject({
      code: 'GUARDIAN_REQUIRED',
    });
    expect(ctx.world.people).toHaveLength(0);
    expect(ctx.world.applications[0].status).toBe('PENDING');
  });

  it('refuses a guardian who is the applicant', async () => {
    ctx.world.applications.push(
      buildApplication({
        id: 1,
        documentNumber: '555',
        birthDate: '2014-03-10',
        formData: parseFormData({
          sex: 'MALE',
          guardian: {
            firstName: 'Ana',
            lastName: 'Pérez',
            documentTypeCode: 'CC',
            documentNumber: '555',
            relationship: 'Madre',
            phone: '300',
          },
        }),
      }),
    );

    await expect(
      ctx.approve.execute(REVIEWER, 1, NO_LINK, null),
    ).rejects.toMatchObject({
      code: 'GUARDIAN_SAME_AS_APPLICANT',
    });
  });

  it('blocks a duplicate document unless the reviewer links the existing person', async () => {
    ctx.world.people.push(buildPerson({ id: 50, documentNumber: '10001' }));
    ctx.world.applications.push(buildApplication({ id: 1 }));

    await expect(
      ctx.approve.execute(REVIEWER, 1, NO_LINK, null),
    ).rejects.toBeInstanceOf(ConflictDomainException);
    await expect(
      ctx.approve.execute(REVIEWER, 1, NO_LINK, null),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_DOCUMENT',
    });
    expect(ctx.world.members).toHaveLength(0);
  });

  it('approves on top of an existing person that is not a member, filling only the empty fields', async () => {
    ctx.world.people.push(
      buildPerson({
        id: 50,
        documentNumber: '10001',
        firstName: 'Anita',
        phone: null,
      }),
    );
    ctx.world.applications.push(buildApplication({ id: 1 }));

    const result = await ctx.approve.execute(
      REVIEWER,
      1,
      { linkToPersonId: 50 },
      null,
    );

    expect(ctx.world.people).toHaveLength(1);
    expect(ctx.world.people[0]).toMatchObject({
      id: 50,
      firstName: 'Anita',
      phone: '3001234567',
    });
    expect(ctx.world.members[0].personId).toBe(50);
    expect(result.memberCode).toBe('SC-0001');
  });

  it('re-admits a former member in the congregation of the new application', async () => {
    ctx.world.people.push(buildPerson({ id: 50, documentNumber: '10001' }));
    ctx.world.members.push({
      id: 80,
      denominationId: 1,
      personId: 50,
      congregationId: 11,
      status: 'INACTIVE',
      joinedOn: '2020-01-01',
      previousCongregationName: null,
      isBaptized: null,
    });
    ctx.world.entries.push({
      memberId: 80,
      congregationId: 11,
      memberNumber: 7,
      registryBook: '1',
      registryFolio: '7',
      startedOn: '2020-01-01',
      denominationId: 1,
      endedOn: null,
    });
    ctx.world.applications.push(buildApplication({ id: 1 }));

    const result = await ctx.approve.execute(
      REVIEWER,
      1,
      { linkToPersonId: 50 },
      null,
    );

    expect(result.memberId).toBe(80);
    expect(ctx.world.members).toHaveLength(1);
    expect(ctx.world.members[0]).toMatchObject({
      status: 'ACTIVE',
      congregationId: 10,
    });
    expect(ctx.world.entries.find((e) => e.memberNumber === 7)?.endedOn).toBe(
      '2026-11-02',
    );
    expect(
      ctx.world.entries.find((e) => e.memberNumber === 1)?.congregationId,
    ).toBe(10);
    expect(ctx.world.histories[0].reason).toContain('Reintegro');
  });

  it('refuses an active member and a deceased one', async () => {
    ctx.world.people.push(
      buildPerson({ id: 50, documentNumber: '10001' }),
      buildPerson({ id: 51, documentNumber: '10002' }),
    );
    for (const [id, personId, status] of [
      [80, 50, 'ACTIVE'],
      [81, 51, 'DECEASED'],
    ] as const) {
      ctx.world.members.push({
        id,
        denominationId: 1,
        personId,
        congregationId: 10,
        status,
        joinedOn: '2020-01-01',
        previousCongregationName: null,
        isBaptized: null,
      });
    }
    ctx.world.applications.push(
      buildApplication({ id: 1 }),
      buildApplication({ id: 2 }),
    );

    await expect(
      ctx.approve.execute(REVIEWER, 1, { linkToPersonId: 50 }, null),
    ).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
    await expect(
      ctx.approve.execute(REVIEWER, 2, { linkToPersonId: 51 }, null),
    ).rejects.toBeInstanceOf(BusinessRuleException);
  });

  it('refuses a link to a person that does not hold the document', async () => {
    ctx.world.people.push(
      buildPerson({ id: 50, documentNumber: '10001' }),
      buildPerson({ id: 51, documentNumber: '999' }),
    );
    ctx.world.applications.push(
      buildApplication({ id: 1 }),
      buildApplication({ id: 2, documentNumber: '12' }),
    );

    await expect(
      ctx.approve.execute(REVIEWER, 1, { linkToPersonId: 51 }, null),
    ).rejects.toMatchObject({ code: 'INVALID_MATCH' });
    // Linking when nobody holds the document is also a mismatch.
    await expect(
      ctx.approve.execute(REVIEWER, 2, { linkToPersonId: 51 }, null),
    ).rejects.toMatchObject({ code: 'INVALID_MATCH' });
  });

  it('does not approve twice', async () => {
    ctx.world.applications.push(buildApplication({ id: 1 }));
    await ctx.approve.execute(REVIEWER, 1, NO_LINK, null);

    await expect(
      ctx.approve.execute(REVIEWER, 1, NO_LINK, null),
    ).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    expect(ctx.world.members).toHaveLength(1);
  });

  it('rolls everything back when a step fails', async () => {
    ctx.world.applications.push(buildApplication({ id: 1 }));
    ctx.world.failOn = 'recordConsent';

    await expect(
      ctx.approve.execute(REVIEWER, 1, NO_LINK, null),
    ).rejects.toThrow('Simulated failure');

    expect(ctx.world.applications[0].status).toBe('PENDING');
    expect(ctx.world.people).toHaveLength(0);
    expect(ctx.world.members).toHaveLength(0);
    expect(ctx.world.entries).toHaveLength(0);
  });

  it('never approves an application of another denomination', async () => {
    ctx.world.applications.push(buildApplication({ id: 1 }));

    await expect(
      ctx.approve.execute(contextOf(TENANT_B), 1, NO_LINK, null),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(ctx.world.people).toHaveLength(0);
  });
});
