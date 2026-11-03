import {
  TENANT_A,
  TENANT_A_SIBLING,
  TENANT_A_WIDE,
  TENANT_B,
} from '../../../../../test/support/tenants.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import { tenantFor } from '../../../attendance/testing/test-doubles.js';
import {
  RECORDS_PERMISSIONS,
  type RecordsFixture,
  buildRecordsFixture,
} from '../../testing/records-fixture.js';

let fixture: RecordsFixture;

const as = (scope: TenantScope) => tenantFor(scope, RECORDS_PERMISSIONS);

beforeEach(() => {
  fixture = buildRecordsFixture();
});

describe('GetRecordsContext', () => {
  it('offers the sede of a sede role, every sede of a denomination role and the server date', async () => {
    const sede = await fixture.useCases.context.execute(as(TENANT_A));
    const wide = await fixture.useCases.context.execute(as(TENANT_A_WIDE));
    const other = await fixture.useCases.context.execute(as(TENANT_B));

    expect(sede.congregations.map((c) => c.id)).toEqual([10]);
    expect(wide.congregations.map((c) => c.id)).toEqual([10, 11]);
    expect(other.congregations.map((c) => c.id)).toEqual([20]);
    expect(sede.today).toBe('2026-11-02');
  });
});

describe('GetRecordsSummary', () => {
  async function populate() {
    const pastor = fixture.world.person(1, 'Daniel Herrera', {
      congregationId: 10,
    });
    const second = fixture.world.person(1, 'Sara Núñez', {
      congregationId: 11,
    });
    fixture.terms.seed(1, 10, pastor, '2021-02-01', null);
    fixture.terms.seed(1, 10, pastor, '2010-02-01', '2020-12-31');
    fixture.terms.seed(1, 11, second, '2023-01-01', null);
    fixture.terms.seed(
      2,
      20,
      fixture.world.person(2, 'Ricardo León', { congregationId: 20 }),
      '2019-01-01',
      null,
    );

    const mother = fixture.world.person(1, 'Lucía Peña', {
      congregationId: 10,
    }).id;
    const groom = fixture.world.person(1, 'Andrés Mora', {
      congregationId: 10,
    }).id;
    await fixture.useCases.recordMarriage.execute(as(TENANT_A), {
      spouse1Id: mother,
      spouse2Id: groom,
      marriedOn: '2026-07-18',
      place: 'Templo',
      registeredWith: 'CHURCH',
    });
    for (const [name, date] of [
      ['Ana', '2026-03-01'],
      ['Beto', '2025-09-01'],
    ]) {
      const kid = fixture.world.person(1, name, { birthDate: '2024-01-01' }).id;
      await fixture.useCases.recordDedication.execute(as(TENANT_A), {
        congregationId: 10,
        childId: kid,
        dedicatedOn: date,
        mother: { personId: mother },
      });
    }
  }

  it('summarizes a sede with its current pastor', async () => {
    await populate();

    const summary = await fixture.useCases.summary.execute(as(TENANT_A));

    expect(summary).toMatchObject({
      year: 2026,
      dedicationsThisYear: 1,
      dedicationsTotal: 2,
      marriagesActive: 1,
      marriagesDissolved: 0,
      termsTotal: 2,
      congregationsWithPastor: 1,
      congregationsTotal: 1,
      currentPastor: {
        congregationId: 10,
        fullName: 'Daniel Herrera',
        startedOn: '2021-02-01',
      },
    });
  });

  it('summarizes a denomination without a single current pastor and without counting other denominations', async () => {
    await populate();

    const summary = await fixture.useCases.summary.execute(as(TENANT_A_WIDE));

    expect(summary).toMatchObject({
      termsTotal: 3,
      congregationsWithPastor: 2,
      congregationsTotal: 2,
      currentPastor: null,
    });
  });

  it('shows a sede nothing from its sibling', async () => {
    await populate();

    const summary = await fixture.useCases.summary.execute(
      as(TENANT_A_SIBLING),
    );

    expect(summary).toMatchObject({
      dedicationsTotal: 0,
      marriagesActive: 0,
      termsTotal: 1,
    });
    expect(summary.currentPastor?.fullName).toBe('Sara Núñez');
  });

  it('counts nothing for another denomination', async () => {
    await populate();

    const summary = await fixture.useCases.summary.execute(as(TENANT_B));

    expect(summary).toMatchObject({
      dedicationsTotal: 0,
      marriagesActive: 0,
      termsTotal: 1,
    });
  });
});

describe('SearchRecordPeople', () => {
  it('finds people of the denomination by name, with the document masked, and never other denominations', async () => {
    fixture.world.person(1, 'Marta Castillo', { congregationId: 10 });
    fixture.world.person(1, 'Martín Gil');
    fixture.world.person(2, 'Marta Ajena', { congregationId: 20 });

    const hits = await fixture.useCases.searchPeople.execute(as(TENANT_A), {
      query: ' mart ',
      eligibleFor: 'spouse',
    });

    expect(hits.map((hit) => hit.fullName).sort()).toEqual([
      'Marta Castillo',
      'Martín Gil',
    ]);
    expect(hits.every((hit) => hit.maskedDocument?.includes('····'))).toBe(
      true,
    );
    expect(JSON.stringify(hits)).not.toMatch(/\d{6,}/);
  });

  it('requires a search text', async () => {
    await expect(
      fixture.useCases.searchPeople.execute(as(TENANT_A), { query: '   ' }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it('answers an empty list, not an error, to a tenant that has nobody with that name', async () => {
    fixture.world.person(1, 'Marta Castillo', { congregationId: 10 });

    await expect(
      fixture.useCases.searchPeople.execute(as(TENANT_B), { query: 'Marta' }),
    ).resolves.toEqual([]);
    await expect(
      fixture.useCases.searchPeople.execute(as(TENANT_A), { query: 'Marta' }),
    ).resolves.toHaveLength(1);
  });
});
