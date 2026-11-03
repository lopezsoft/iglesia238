import {
  TENANT_A,
  TENANT_A_WIDE,
  TENANT_B,
} from '../../../../../test/support/tenants.js';
import { NotFoundDomainException } from '../../../../common/errors/domain.exception.js';
import { buildMembershipFakes } from '../testing/in-memory-membership.js';
import {
  SearchFamilyCandidatesUseCase,
  SearchPeopleUseCase,
} from './search-people.use-case.js';

function setup() {
  const fakes = buildMembershipFakes();
  const { store } = fakes;
  const ana = store.seedMember(1, 10, {
    person: {
      firstName: 'Ana',
      lastName: 'Rojas',
      documentNumber: '52418916',
      birthDate: '1989-01-01',
    },
  });
  const luis = store.seedMember(1, 11, {
    person: {
      firstName: 'Luis',
      lastName: 'Rojas',
      documentNumber: '70123456',
      birthDate: '1980-02-02',
    },
  });
  const niño = store.seedMember(1, 10, {
    person: {
      firstName: 'Mateo',
      lastName: 'Rojas',
      documentNumber: '1100',
      birthDate: '2016-01-01',
    },
  });
  const relative = store.seedPerson({
    denominationId: 1,
    firstName: 'Pedro',
    lastName: 'Rojas',
    documentNumber: '8001',
    birthDate: '1960-01-01',
  });
  const foreign = store.seedMember(2, 20, {
    person: { firstName: 'Zoe', lastName: 'Rojas', documentNumber: '999111' },
  });
  return {
    ...fakes,
    ana,
    luis,
    niño,
    relative,
    foreign,
    search: new SearchPeopleUseCase(fakes.search, fakes.clock),
  };
}

describe('SearchPeopleUseCase', () => {
  it('does not search with fewer than two characters', async () => {
    const { search } = setup();

    await expect(
      search.execute(TENANT_A, { purpose: 'FAMILY_CANDIDATE', query: 'R' }),
    ).resolves.toEqual([]);
  });

  it('always masks the document', async () => {
    const { search, ana } = setup();

    const [hit] = await search.execute(TENANT_A, {
      purpose: 'MEMBER_LOOKUP',
      query: 'Ana',
    });

    expect(hit).toMatchObject({
      personId: ana.personId,
      maskedDocument: 'CC ···· 8916',
      age: 37,
    });
    expect(JSON.stringify(hit)).not.toContain('52418916');
  });

  it('MEMBER_LOOKUP finds only active members of the congregation', async () => {
    const { search, store, ana, niño } = setup();
    store.members.find((row) => row.id === niño.id)!.status = 'INACTIVE';

    const hits = await search.execute(TENANT_A, {
      purpose: 'MEMBER_LOOKUP',
      query: 'Rojas',
    });

    expect(hits.map((hit) => hit.personId)).toEqual([ana.personId]);
  });

  it('MEMBER_LOOKUP needs a congregation', async () => {
    const { search } = setup();

    await expect(
      search.execute(TENANT_A_WIDE, {
        purpose: 'MEMBER_LOOKUP',
        query: 'Rojas',
      }),
    ).rejects.toMatchObject({ code: 'CONGREGATION_SCOPE_REQUIRED' });
  });

  it('FAMILY_CANDIDATE offers members and non-members of the denomination, never of another one', async () => {
    const { search, ana, luis, niño, relative, foreign } = setup();

    const hits = await search.execute(TENANT_A, {
      purpose: 'FAMILY_CANDIDATE',
      query: 'Rojas',
      excludePersonId: ana.personId,
    });

    const ids = hits.map((hit) => hit.personId);
    expect(ids).toEqual(
      expect.arrayContaining([luis.personId, niño.personId, relative.id]),
    );
    expect(ids).not.toContain(ana.personId);
    expect(ids).not.toContain(foreign.personId);
  });

  it('SECRETARIAT shows the members of the congregation plus people without a member record', async () => {
    const { search, ana, luis, relative } = setup();

    const congregation = await search.execute(TENANT_A, {
      purpose: 'SECRETARIAT',
      query: 'Rojas',
    });
    const ids = congregation.map((hit) => hit.personId);
    expect(ids).toContain(ana.personId);
    expect(ids).toContain(relative.id);
    expect(ids).not.toContain(luis.personId);

    const wide = await search.execute(TENANT_A_WIDE, {
      purpose: 'SECRETARIAT',
      query: 'Rojas',
    });
    expect(wide.map((hit) => hit.personId)).toContain(luis.personId);
  });

  it('applies eligibility by age and excludes people who are already married as spouses', async () => {
    const { search, store, ana, luis, niño } = setup();
    store.marriagePersonIds.add(ana.personId);

    const children = await search.execute(TENANT_A, {
      purpose: 'SECRETARIAT',
      query: 'Rojas',
      eligibleFor: 'child',
    });
    expect(children.map((hit) => hit.personId)).toEqual([niño.personId]);

    const spouses = await search.execute(TENANT_A_WIDE, {
      purpose: 'SECRETARIAT',
      query: 'Rojas',
      eligibleFor: 'spouse',
    });
    const ids = spouses.map((hit) => hit.personId);
    expect(ids).toContain(luis.personId);
    expect(ids).not.toContain(ana.personId);
    expect(ids).not.toContain(niño.personId);
  });

  it('UNLINKED_PERSON lists only people who are not members', async () => {
    const { search, relative } = setup();

    const hits = await search.execute(TENANT_A, {
      purpose: 'UNLINKED_PERSON',
      query: 'Rojas',
    });

    expect(hits.map((hit) => hit.personId)).toEqual([relative.id]);
  });

  it('CONTRIBUTOR leaves out deceased members', async () => {
    const { search, store, luis } = setup();
    store.members.find((row) => row.id === luis.id)!.status = 'DECEASED';

    const hits = await search.execute(TENANT_A_WIDE, {
      purpose: 'CONTRIBUTOR',
      query: 'Rojas',
    });

    expect(hits.map((hit) => hit.personId)).not.toContain(luis.personId);
  });

  it('never returns people of another denomination for any purpose', async () => {
    const { search, foreign } = setup();

    for (const purpose of [
      'MEMBER_LOOKUP',
      'FAMILY_CANDIDATE',
      'SECRETARIAT',
      'UNLINKED_PERSON',
      'CONTRIBUTOR',
    ] as const) {
      const hits = await search.execute(TENANT_B, { purpose, query: 'Rojas' });
      // Only the member of the other denomination's own congregation is visible to its tenant.
      expect(hits.map((hit) => hit.personId)).toEqual(
        purpose === 'UNLINKED_PERSON' ? [] : [foreign.personId],
      );
    }
  });

  it('limits the number of results', async () => {
    const { search } = setup();

    const hits = await search.execute(TENANT_A, {
      purpose: 'FAMILY_CANDIDATE',
      query: 'Rojas',
      limit: 2,
    });

    expect(hits).toHaveLength(2);
  });
});

describe('SearchFamilyCandidatesUseCase', () => {
  it('leaves the member out and answers 404 for a member outside the scope', async () => {
    const { ana, luis, search, members } = setup();
    const candidates = new SearchFamilyCandidatesUseCase(members, search);

    const hits = await candidates.execute(TENANT_A, ana.id, 'Rojas');

    expect(hits.map((hit) => hit.personId)).not.toContain(ana.personId);
    expect(hits.length).toBeGreaterThan(0);
    await expect(
      candidates.execute(TENANT_A, luis.id, 'Rojas'),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      candidates.execute(TENANT_B, ana.id, 'Rojas'),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });
});
