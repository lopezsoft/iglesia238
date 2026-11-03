import { describeCrossTenantIsolation } from '../../../../../test/support/cross-tenant.js';
import {
  TENANT_A,
  TENANT_A_SIBLING,
  TENANT_A_WIDE,
  TENANT_B,
} from '../../../../../test/support/tenants.js';
import { NotFoundDomainException } from '../../../../common/errors/domain.exception.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import { tenantFor } from '../../../attendance/testing/test-doubles.js';
import {
  RECORDS_PERMISSIONS,
  type RecordsFixture,
  buildRecordsFixture,
} from '../../testing/records-fixture.js';

let fixture: RecordsFixture;
let pastorA: number;
let pastorB: number;

const asA = () => tenantFor(TENANT_A, RECORDS_PERMISSIONS);

beforeEach(() => {
  fixture = buildRecordsFixture();
  pastorA = fixture.world.person(1, 'Daniel Herrera', {
    congregationId: 10,
  }).id;
  pastorB = fixture.world.person(2, 'Ricardo León', { congregationId: 20 }).id;
});

function term(overrides: Record<string, unknown> = {}) {
  return {
    congregationId: 10,
    pastorId: pastorA,
    startedOn: '2026-11-01',
    endedOn: null,
    closeCurrent: false,
    ...overrides,
  };
}

describe('RecordPastoralTerm', () => {
  it('rejects a term that overlaps the open term of the sede (409 OVERLAPPING_TERM)', async () => {
    fixture.terms.seed(
      1,
      10,
      fixture.world.summaryOf(pastorA),
      '2021-02-01',
      null,
    );

    await expect(
      fixture.useCases.recordTerm.execute(asA(), term()),
    ).rejects.toMatchObject({
      code: 'OVERLAPPING_TERM',
    });
  });

  it('rejects a term that overlaps a closed one', async () => {
    fixture.terms.seed(
      1,
      10,
      fixture.world.summaryOf(pastorA),
      '2010-01-01',
      '2015-12-31',
    );

    await expect(
      fixture.useCases.recordTerm.execute(
        asA(),
        term({ startedOn: '2010-01-01', endedOn: '2012-01-01' }),
      ),
    ).rejects.toMatchObject({ code: 'OVERLAPPING_TERM' });
  });

  it('closes the current term the day before the new one when asked, atomically and audited', async () => {
    const open = fixture.terms.seed(
      1,
      10,
      fixture.world.summaryOf(pastorA),
      '2021-02-01',
      null,
    );

    const created = await fixture.useCases.recordTerm.execute(
      asA(),
      term({ closeCurrent: true }),
    );

    const terms = await fixture.useCases.listTerms.execute(asA(), {});
    expect(created.endedOn).toBeNull();
    expect(terms.find((row) => row.id === open.id)?.endedOn).toBe('2026-10-31');
    expect(
      terms.filter((row) => row.endedOn === null).map((row) => row.id),
    ).toEqual([created.id]);
    expect(fixture.transactions.runs).toBe(1);
    expect(fixture.world.locks).toContain('congregation:10');
    expect(fixture.audit.entries.map((entry) => entry.action)).toEqual([
      'PASTORAL_TERM_CLOSED',
      'PASTORAL_TERM_RECORDED',
    ]);
    expect(fixture.audit.entries[0].changes).toEqual({
      endedOn: { from: null, to: '2026-10-31' },
    });
  });

  it('does not close the current term when the new one would start before it', async () => {
    fixture.terms.seed(
      1,
      10,
      fixture.world.summaryOf(pastorA),
      '2026-12-01',
      null,
    );

    await expect(
      fixture.useCases.recordTerm.execute(
        asA(),
        term({ startedOn: '2026-11-01', closeCurrent: true }),
      ),
    ).rejects.toMatchObject({ code: 'OVERLAPPING_TERM' });
  });

  it('accepts a closed term in a free range and rejects an end before the start', async () => {
    fixture.terms.seed(
      1,
      10,
      fixture.world.summaryOf(pastorA),
      '2021-02-01',
      null,
    );

    const before = await fixture.useCases.recordTerm.execute(
      asA(),
      term({ startedOn: '1990-01-01', endedOn: '1994-01-14' }),
    );
    expect(before.endedOn).toBe('1994-01-14');

    await expect(
      fixture.useCases.recordTerm.execute(
        asA(),
        term({ startedOn: '1985-05-01', endedOn: '1985-04-30' }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_DATE' });
    await expect(
      fixture.useCases.recordTerm.execute(
        asA(),
        term({ startedOn: '2026-02-30' }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_DATE' });
  });

  it('does not compare terms of different sedes', async () => {
    fixture.terms.seed(
      1,
      10,
      fixture.world.summaryOf(pastorA),
      '2005-01-01',
      null,
    );

    const created = await fixture.useCases.recordTerm.execute(
      tenantFor(TENANT_A_WIDE, RECORDS_PERMISSIONS),
      term({
        congregationId: 11,
        startedOn: '2005-01-01',
        endedOn: '2007-12-31',
      }),
    );

    expect(created.congregationId).toBe(11);
  });

  it('does not write anything when the request is rejected', async () => {
    fixture.terms.seed(
      1,
      10,
      fixture.world.summaryOf(pastorA),
      '2021-02-01',
      null,
    );

    await expect(
      fixture.useCases.recordTerm.execute(asA(), term()),
    ).rejects.toBeDefined();

    expect(fixture.world.terms).toHaveLength(1);
    expect(fixture.audit.entries).toHaveLength(0);
  });

  it('refuses a pastor from another denomination and a sede outside the scope', async () => {
    await expect(
      fixture.useCases.recordTerm.execute(asA(), term({ pastorId: pastorB })),
    ).rejects.toMatchObject({ code: 'PERSON_NOT_FOUND' });
    await expect(
      fixture.useCases.recordTerm.execute(asA(), term({ congregationId: 11 })),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      fixture.useCases.recordTerm.execute(
        tenantFor(TENANT_A_WIDE, RECORDS_PERMISSIONS),
        term({ congregationId: 20 }),
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  describeCrossTenantIsolation('RecordPastoralTerm', {
    arrange: () => {
      fixture = buildRecordsFixture();
      pastorA = fixture.world.person(1, 'Daniel Herrera', {
        congregationId: 10,
      }).id;
      return 10;
    },
    act: (scope: TenantScope, congregationId: number) =>
      fixture.useCases.recordTerm.execute(
        tenantFor(scope, RECORDS_PERMISSIONS),
        term({ congregationId }),
      ),
  });
});

describe('ListPastoralTerms', () => {
  it('lists the terms of the scope by sede, most recent first, and only the open ones on request', async () => {
    const person = fixture.world.summaryOf(pastorA);
    fixture.terms.seed(1, 10, person, '2010-01-01', '2015-12-31');
    fixture.terms.seed(1, 10, person, '2016-01-01', null);
    fixture.terms.seed(1, 11, person, '2018-01-01', null);
    fixture.terms.seed(
      2,
      20,
      fixture.world.summaryOf(pastorB),
      '2019-01-01',
      null,
    );

    const wide = await fixture.useCases.listTerms.execute(
      tenantFor(TENANT_A_WIDE, RECORDS_PERMISSIONS),
      {},
    );
    const current = await fixture.useCases.listTerms.execute(
      tenantFor(TENANT_A_WIDE, RECORDS_PERMISSIONS),
      {
        currentOnly: true,
      },
    );
    const sede = await fixture.useCases.listTerms.execute(asA(), {});

    expect(wide.map((row) => [row.congregationId, row.startedOn])).toEqual([
      [10, '2016-01-01'],
      [10, '2010-01-01'],
      [11, '2018-01-01'],
    ]);
    expect(current).toHaveLength(2);
    expect(sede.every((row) => row.congregationId === 10)).toBe(true);
  });

  describeCrossTenantIsolation('ListPastoralTerms (by sede)', {
    arrange: () => {
      fixture = buildRecordsFixture();
      return 10;
    },
    act: (scope: TenantScope, congregationId: number) =>
      fixture.useCases.listTerms.execute(
        tenantFor(scope, RECORDS_PERMISSIONS),
        { congregationId },
      ),
  });
});

describe('ClosePastoralTerm', () => {
  it('puts the end date on the open term and audits it', async () => {
    const open = fixture.terms.seed(
      1,
      10,
      fixture.world.summaryOf(pastorA),
      '2021-02-01',
      null,
    );

    const closed = await fixture.useCases.closeTerm.execute(
      asA(),
      open.id,
      '2026-10-31',
    );

    expect(closed.endedOn).toBe('2026-10-31');
    expect(fixture.audit.last).toMatchObject({
      action: 'PASTORAL_TERM_CLOSED',
      changes: { endedOn: { from: null, to: '2026-10-31' } },
    });
  });

  it('rejects a closed term, an end before the start and a future end', async () => {
    const open = fixture.terms.seed(
      1,
      10,
      fixture.world.summaryOf(pastorA),
      '2021-02-01',
      null,
    );
    const closed = fixture.terms.seed(
      1,
      10,
      fixture.world.summaryOf(pastorA),
      '2010-01-01',
      '2012-01-01',
    );

    await expect(
      fixture.useCases.closeTerm.execute(asA(), closed.id, '2026-10-01'),
    ).rejects.toMatchObject({
      code: 'TERM_ALREADY_CLOSED',
    });
    await expect(
      fixture.useCases.closeTerm.execute(asA(), open.id, '2021-01-31'),
    ).rejects.toMatchObject({
      code: 'INVALID_DATE',
    });
    await expect(
      fixture.useCases.closeTerm.execute(asA(), open.id, '2026-11-03'),
    ).rejects.toMatchObject({
      code: 'INVALID_DATE',
    });
  });

  describeCrossTenantIsolation('ClosePastoralTerm', {
    arrange: () => {
      fixture = buildRecordsFixture();
      pastorA = fixture.world.person(1, 'Daniel Herrera', {
        congregationId: 10,
      }).id;
      return fixture.terms.seed(
        1,
        10,
        fixture.world.summaryOf(pastorA),
        '2021-02-01',
        null,
      ).id;
    },
    act: (scope: TenantScope, id: number) =>
      fixture.useCases.closeTerm.execute(
        tenantFor(scope, RECORDS_PERMISSIONS),
        id,
        '2026-10-31',
      ),
  });

  it('keeps its message in Spanish and never exposes another tenant (sanity)', async () => {
    const open = fixture.terms.seed(
      2,
      20,
      fixture.world.summaryOf(pastorB),
      '2021-02-01',
      null,
    );

    await expect(
      fixture.useCases.closeTerm.execute(
        tenantFor(TENANT_A_SIBLING, RECORDS_PERMISSIONS),
        open.id,
        '2026-10-31',
      ),
    ).rejects.toMatchObject({ code: 'TERM_NOT_FOUND' });
    await expect(
      fixture.useCases.closeTerm.execute(
        tenantFor(TENANT_B, RECORDS_PERMISSIONS),
        open.id,
        '2026-10-31',
      ),
    ).resolves.toMatchObject({ endedOn: '2026-10-31' });
  });
});
