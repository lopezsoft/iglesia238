import { TENANT_A } from '../../../../../test/support/tenants.js';
import { describeCrossTenantIsolation } from '../../../../../test/support/cross-tenant.js';
import { commandContext } from '../testing/context.js';
import { buildMembershipFakes } from '../testing/in-memory-membership.js';
import {
  AddStudyUseCase,
  ListStudiesUseCase,
  RemoveStudyUseCase,
} from './member-studies.use-cases.js';
import {
  AssignPositionUseCase,
  ClosePositionUseCase,
  GetMemberPositionsUseCase,
  SetPastoralRankUseCase,
} from './member-positions.use-cases.js';

function setup() {
  const fakes = buildMembershipFakes();
  const { store } = fakes;
  store.positionCatalog.push(
    { id: 1, denominationId: 1, name: 'Diácono', isActive: true },
    { id: 2, denominationId: 1, name: 'Tesorero', isActive: false },
    { id: 3, denominationId: 2, name: 'Otro cargo', isActive: true },
  );
  store.rankCatalog.push({
    id: 1,
    denominationId: 1,
    name: 'Evangelista',
    isActive: true,
  });
  const member = store.seedMember(1, 10);
  return {
    ...fakes,
    member,
    listStudies: new ListStudiesUseCase(fakes.members, fakes.studies),
    addStudy: new AddStudyUseCase(
      fakes.members,
      fakes.studies,
      fakes.catalogs,
      fakes.transactions,
      fakes.audit,
      fakes.clock,
    ),
    removeStudy: new RemoveStudyUseCase(
      fakes.members,
      fakes.studies,
      fakes.transactions,
      fakes.audit,
    ),
    view: new GetMemberPositionsUseCase(fakes.members, fakes.positions),
    assign: new AssignPositionUseCase(
      fakes.members,
      fakes.positions,
      fakes.transactions,
      fakes.audit,
      fakes.clock,
    ),
    close: new ClosePositionUseCase(
      fakes.members,
      fakes.positions,
      fakes.transactions,
      fakes.audit,
      fakes.clock,
    ),
    rank: new SetPastoralRankUseCase(
      fakes.members,
      fakes.positions,
      fakes.transactions,
      fakes.audit,
    ),
  };
}

const STUDY = {
  studyTypeCode: 'COURSE',
  name: 'Consejería familiar',
  institution: null,
  status: 'COMPLETED',
  year: 2022,
} as const;

describe('studies', () => {
  it('adds a study and lists the newest first', async () => {
    const { addStudy, listStudies, member } = setup();
    const context = commandContext(TENANT_A);
    await addStudy.execute(context, member.id, STUDY);
    await addStudy.execute(context, member.id, {
      ...STUDY,
      name: 'Teología básica',
      year: 2024,
    });

    const studies = await listStudies.execute(TENANT_A, member.id);

    expect(studies.map((study) => study.year)).toEqual([2024, 2022]);
  });

  it('requires the year of a completed study and a known type, and refuses duplicates', async () => {
    const { addStudy, member } = setup();
    const context = commandContext(TENANT_A);

    await expect(
      addStudy.execute(context, member.id, { ...STUDY, year: null }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      addStudy.execute(context, member.id, { ...STUDY, studyTypeCode: 'NOPE' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await addStudy.execute(context, member.id, STUDY);
    await expect(
      addStudy.execute(context, member.id, STUDY),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_STUDY',
    });
  });

  const fixture = setup();
  describeCrossTenantIsolation('AddStudyUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) =>
      fixture.addStudy.execute(commandContext(scope), id, STUDY),
  });
  describeCrossTenantIsolation('ListStudiesUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) => fixture.listStudies.execute(scope, id),
  });
  describeCrossTenantIsolation('RemoveStudyUseCase', {
    arrange: (owner) => {
      const member = fixture.store.seedMember(
        owner.denominationId,
        owner.congregationId ?? 10,
      );
      const id = fixture.store.nextId();
      fixture.store.studies.push({
        id,
        denominationId: owner.denominationId,
        personId: member.personId,
        name: 'Curso',
        studyTypeId: 1,
        institution: null,
        status: 'COMPLETED',
        year: 2020,
      });
      return { memberId: member.id, studyId: id };
    },
    act: (scope, { memberId, studyId }) =>
      fixture.removeStudy.execute(commandContext(scope), memberId, studyId),
  });
});

describe('positions and pastoral rank', () => {
  it('assigns a position, refuses it twice and closes it', async () => {
    const { assign, close, view, member } = setup();
    const context = commandContext(TENANT_A);

    await assign.execute(context, member.id, {
      positionId: 1,
      startedOn: '2026-01-01',
    });
    await expect(
      assign.execute(context, member.id, {
        positionId: 1,
        startedOn: '2026-02-01',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_POSITION' });

    const [row] = (await view.execute(TENANT_A, member.id)).positions;
    await expect(
      close.execute(context, member.id, row.id, '2025-01-01'),
    ).rejects.toMatchObject({
      code: 'INVALID_DATE',
    });
    await close.execute(context, member.id, row.id, '2026-11-02');
    await expect(
      close.execute(context, member.id, row.id, '2026-11-02'),
    ).rejects.toMatchObject({
      code: 'POSITION_ALREADY_CLOSED',
    });
  });

  it('only gives positions to active members and from the active catalog of the denomination', async () => {
    const { assign, member, store } = setup();
    const context = commandContext(TENANT_A);

    await expect(
      assign.execute(context, member.id, {
        positionId: 2,
        startedOn: '2026-01-01',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      assign.execute(context, member.id, {
        positionId: 3,
        startedOn: '2026-01-01',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    store.members[0].status = 'INACTIVE';
    await expect(
      assign.execute(context, member.id, {
        positionId: 1,
        startedOn: '2026-01-01',
      }),
    ).rejects.toMatchObject({ code: 'MEMBER_NOT_ACTIVE' });
  });

  it('sets and clears the pastoral rank from the catalog of the denomination', async () => {
    const { rank, view, member } = setup();
    const context = commandContext(TENANT_A);

    await rank.execute(context, member.id, 1);
    expect(await view.execute(TENANT_A, member.id)).toMatchObject({
      pastoralRankId: 1,
      pastoralRankName: 'Evangelista',
    });
    await rank.execute(context, member.id, null);
    await expect(rank.execute(context, member.id, 99)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  const fixture = setup();
  describeCrossTenantIsolation('GetMemberPositionsUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) => fixture.view.execute(scope, id),
  });
  describeCrossTenantIsolation('AssignPositionUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) =>
      fixture.assign.execute(commandContext(scope), id, {
        positionId: 1,
        startedOn: '2026-01-01',
      }),
  });
  describeCrossTenantIsolation('SetPastoralRankUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) => fixture.rank.execute(commandContext(scope), id, null),
  });
});
