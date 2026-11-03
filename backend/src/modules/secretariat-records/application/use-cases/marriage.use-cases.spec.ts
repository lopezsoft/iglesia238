import { describeCrossTenantIsolation } from '../../../../../test/support/cross-tenant.js';
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
import type { RecordMarriageCommand } from './marriage.use-cases.js';

let fixture: RecordsFixture;
let groom: number;
let bride: number;
let outsider: number;

const asA = () => tenantFor(TENANT_A, RECORDS_PERMISSIONS);

beforeEach(() => {
  fixture = buildRecordsFixture();
  groom = fixture.world.person(1, 'Andrés Mora', {
    congregationId: 10,
    sex: 'MALE',
  }).id;
  bride = fixture.world.person(1, 'Lucía Peña', {
    congregationId: 10,
    sex: 'FEMALE',
  }).id;
  // A member of the sibling sede: valid spouse as long as the other one belongs to the active sede.
  outsider = fixture.world.person(1, 'Paula Ruiz', {
    congregationId: 11,
    sex: 'FEMALE',
  }).id;
});

function command(
  overrides: Partial<RecordMarriageCommand> = {},
): RecordMarriageCommand {
  return {
    spouse1Id: bride,
    spouse2Id: groom,
    marriedOn: '2026-10-10',
    place: 'Sede Central · Templo principal',
    registeredWith: 'CHURCH',
    officiantId: null,
    ...overrides,
  };
}

describe('RecordMarriage', () => {
  it('records the marriage with the lower person id as spouse 1, locking both people', async () => {
    const created = await fixture.useCases.recordMarriage.execute(
      asA(),
      command(),
    );

    expect(created.spouse1.id).toBe(Math.min(bride, groom));
    expect(created.spouse2.id).toBe(Math.max(bride, groom));
    expect(created).toMatchObject({ status: 'ACTIVE', endedOn: null });
    expect(created.code).toMatch(/^MAT-\d{4}$/);
    expect(fixture.world.locks).toEqual([
      `people:${Math.min(bride, groom)},${Math.max(bride, groom)}`,
    ]);
    expect(fixture.audit.last).toMatchObject({
      action: 'MARRIAGE_RECORDED',
      changes: {
        registeredWith: { from: null, to: 'CHURCH' },
        marriedOn: { from: null, to: '2026-10-10' },
      },
    });
  });

  it('rejects a person with an active marriage until it is dissolved', async () => {
    await fixture.useCases.recordMarriage.execute(asA(), command());
    const other = fixture.world.person(1, 'Camilo Díaz', {
      congregationId: 10,
    }).id;
    const second = command({ spouse1Id: groom, spouse2Id: other });

    await expect(
      fixture.useCases.recordMarriage.execute(asA(), second),
    ).rejects.toMatchObject({
      code: 'ACTIVE_MARRIAGE_EXISTS',
    });

    const marriage = (
      await fixture.useCases.listMarriages.execute(asA(), {
        page: 1,
        pageSize: 10,
      })
    ).items[0];
    await fixture.useCases.dissolveMarriage.execute(asA(), marriage.id, {
      endedOn: '2026-10-20',
      endReason: 'DIVORCE',
    });
    await expect(
      fixture.useCases.recordMarriage.execute(asA(), second),
    ).resolves.toMatchObject({
      status: 'ACTIVE',
    });
  });

  it('requires two different people', async () => {
    await expect(
      fixture.useCases.recordMarriage.execute(
        asA(),
        command({ spouse1Id: groom, spouse2Id: groom }),
      ),
    ).rejects.toMatchObject({ code: 'SAME_PERSON' });
  });

  it('rejects a spouse who is a minor or was born after the marriage date', async () => {
    const minor = fixture.world.person(1, 'Isabella', {
      congregationId: 10,
      birthDate: '2023-01-25',
    }).id;

    await expect(
      fixture.useCases.recordMarriage.execute(
        asA(),
        command({ spouse2Id: minor }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_SPOUSE' });
    await expect(
      fixture.useCases.recordMarriage.execute(
        asA(),
        command({ spouse2Id: minor, marriedOn: '2020-01-01' }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_SPOUSE' });
  });

  it('assumes an adult when the birth date is unknown', async () => {
    const unknown = fixture.world.person(1, 'Sin fecha', {
      congregationId: 10,
      birthDate: null,
    }).id;

    await expect(
      fixture.useCases.recordMarriage.execute(
        asA(),
        command({ spouse2Id: unknown }),
      ),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it.each([
    ['a future date', { marriedOn: '2026-11-03' }, 'INVALID_DATE'],
    ['an impossible date', { marriedOn: '2026-02-30' }, 'INVALID_DATE'],
    ['an empty place', { place: '   ' }, 'INVALID_PLACE'],
    ['a place that is too long', { place: 'x'.repeat(151) }, 'INVALID_PLACE'],
    [
      'an unknown registry',
      { registeredWith: 'MOSQUE' as never },
      'INVALID_REGISTRY',
    ],
  ])('rejects %s', async (_label, overrides, code) => {
    await expect(
      fixture.useCases.recordMarriage.execute(asA(), command(overrides)),
    ).rejects.toMatchObject({ code });
    expect(fixture.world.marriages).toHaveLength(0);
    expect(fixture.audit.entries).toHaveLength(0);
  });

  it('does not accept a spouse as officiant', async () => {
    await expect(
      fixture.useCases.recordMarriage.execute(
        asA(),
        command({ officiantId: groom }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_OFFICIANT' });
  });

  it('needs one spouse of the active sede, but a denomination role can marry people of any sede', async () => {
    const foreign = fixture.world.person(1, 'Ana Gil', {
      congregationId: 11,
    }).id;

    await expect(
      fixture.useCases.recordMarriage.execute(
        asA(),
        command({ spouse1Id: foreign, spouse2Id: outsider }),
      ),
    ).rejects.toMatchObject({ code: 'PERSON_NOT_FOUND' });
    const guestA = fixture.world.person(1, 'Invitada Uno').id;
    const guestB = fixture.world.person(1, 'Invitado Dos').id;
    await expect(
      fixture.useCases.recordMarriage.execute(
        asA(),
        command({ spouse1Id: guestA, spouse2Id: guestB }),
      ),
    ).rejects.toMatchObject({ code: 'OUT_OF_SCOPE' });
    await expect(
      fixture.useCases.recordMarriage.execute(
        asA(),
        command({ spouse1Id: groom, spouse2Id: outsider }),
      ),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
    await expect(
      fixture.useCases.recordMarriage.execute(
        tenantFor(TENANT_A_WIDE, RECORDS_PERMISSIONS),
        command({
          spouse1Id: foreign,
          spouse2Id: fixture.world.person(1, 'Luis Gil', { congregationId: 11 })
            .id,
        }),
      ),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('answers 404 PERSON_NOT_FOUND for people of another denomination', async () => {
    const stranger = fixture.world.person(2, 'Persona Ajena', {
      congregationId: 20,
    }).id;

    await expect(
      fixture.useCases.recordMarriage.execute(
        asA(),
        command({ spouse2Id: stranger }),
      ),
    ).rejects.toMatchObject({ code: 'PERSON_NOT_FOUND' });
    await expect(
      fixture.useCases.recordMarriage.execute(
        asA(),
        command({ officiantId: stranger }),
      ),
    ).rejects.toMatchObject({ code: 'PERSON_NOT_FOUND' });
  });

  describeCrossTenantIsolation('RecordMarriage (spouses)', {
    arrange: () => {
      fixture = buildRecordsFixture();
      groom = fixture.world.person(1, 'Andrés Mora', { congregationId: 10 }).id;
      bride = fixture.world.person(1, 'Lucía Peña', { congregationId: 10 }).id;
      return groom;
    },
    act: (scope: TenantScope) =>
      fixture.useCases.recordMarriage.execute(
        tenantFor(scope, RECORDS_PERMISSIONS),
        command(),
      ),
  });
});

describe('DissolveMarriage', () => {
  async function married() {
    return fixture.useCases.recordMarriage.execute(
      asA(),
      command({ marriedOn: '2026-07-18' }),
    );
  }

  it('accepts a dissolution on or after the marriage date, once, and audits it without personal data', async () => {
    const marriage = await married();

    await expect(
      fixture.useCases.dissolveMarriage.execute(asA(), marriage.id, {
        endedOn: '2026-07-17',
        endReason: 'ANNULMENT',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_DATE' });

    const dissolved = await fixture.useCases.dissolveMarriage.execute(
      asA(),
      marriage.id,
      {
        endedOn: '2026-07-18',
        endReason: 'ANNULMENT',
      },
    );
    expect(dissolved).toMatchObject({
      status: 'DISSOLVED',
      endReason: 'ANNULMENT',
      endedOn: '2026-07-18',
    });
    expect(fixture.audit.last).toMatchObject({
      action: 'MARRIAGE_DISSOLVED',
      changes: {
        status: { from: 'ACTIVE', to: 'DISSOLVED' },
        endReason: { from: null, to: 'ANNULMENT' },
      },
    });

    await expect(
      fixture.useCases.dissolveMarriage.execute(asA(), marriage.id, {
        endedOn: '2026-08-01',
        endReason: 'DIVORCE',
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_DISSOLVED' });
  });

  it('rejects a future date and an unknown reason', async () => {
    const marriage = await married();

    await expect(
      fixture.useCases.dissolveMarriage.execute(asA(), marriage.id, {
        endedOn: '2026-11-03',
        endReason: 'DEATH',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_DATE' });
    await expect(
      fixture.useCases.dissolveMarriage.execute(asA(), marriage.id, {
        endedOn: '2026-10-01',
        endReason: 'BORED' as never,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_END_REASON' });
  });

  describeCrossTenantIsolation('DissolveMarriage', {
    arrange: async () => {
      fixture = buildRecordsFixture();
      groom = fixture.world.person(1, 'Andrés Mora', { congregationId: 10 }).id;
      bride = fixture.world.person(1, 'Lucía Peña', { congregationId: 10 }).id;
      return (await fixture.useCases.recordMarriage.execute(asA(), command()))
        .id;
    },
    act: (scope: TenantScope, id: number) =>
      fixture.useCases.dissolveMarriage.execute(
        tenantFor(scope, RECORDS_PERMISSIONS),
        id,
        {
          endedOn: '2026-10-20',
          endReason: 'DIVORCE',
        },
      ),
  });
});

describe('ListMarriages and GetMarriage', () => {
  it('shows a sede only the marriages of its members, filters by status and name, and never leaks tribunal data', async () => {
    const central = await fixture.useCases.recordMarriage.execute(
      asA(),
      command(),
    );
    const norteA = fixture.world.person(1, 'Elena Soto', {
      congregationId: 11,
    }).id;
    const norteB = fixture.world.person(1, 'Mateo Soto', {
      congregationId: 11,
    }).id;
    const north = await fixture.useCases.recordMarriage.execute(
      tenantFor(TENANT_A_SIBLING, RECORDS_PERMISSIONS),
      command({ spouse1Id: norteA, spouse2Id: norteB }),
    );
    await fixture.useCases.dissolveMarriage.execute(asA(), central.id, {
      endedOn: '2026-10-20',
      endReason: 'DEATH',
    });

    const sede = await fixture.useCases.listMarriages.execute(asA(), {
      page: 1,
      pageSize: 10,
    });
    const wide = await fixture.useCases.listMarriages.execute(
      tenantFor(TENANT_A_WIDE, RECORDS_PERMISSIONS),
      {
        page: 1,
        pageSize: 10,
      },
    );
    const active = await fixture.useCases.listMarriages.execute(
      tenantFor(TENANT_A_WIDE, RECORDS_PERMISSIONS),
      {
        page: 1,
        pageSize: 10,
        status: 'active',
      },
    );
    const byName = await fixture.useCases.listMarriages.execute(
      tenantFor(TENANT_A_WIDE, RECORDS_PERMISSIONS),
      {
        page: 1,
        pageSize: 10,
        q: 'soto',
      },
    );

    expect(sede.items.map((row) => row.id)).toEqual([central.id]);
    expect(wide.total).toBe(2);
    expect(active.items.map((row) => row.id)).toEqual([north.id]);
    expect(byName.items.map((row) => row.id)).toEqual([north.id]);
    expect(JSON.stringify(wide)).not.toContain('tribunal');
  });

  it('rejects a malformed date filter', async () => {
    await expect(
      fixture.useCases.listMarriages.execute(asA(), {
        page: 1,
        pageSize: 10,
        from: 'ayer',
      }),
    ).rejects.toBeDefined();
  });

  it('never lists the marriages of another denomination', async () => {
    const a = fixture.world.person(2, 'Pareja Uno', { congregationId: 20 }).id;
    const b = fixture.world.person(2, 'Pareja Dos', { congregationId: 20 }).id;
    await fixture.useCases.recordMarriage.execute(
      tenantFor(TENANT_B, RECORDS_PERMISSIONS),
      command({ spouse1Id: a, spouse2Id: b }),
    );

    const own = await fixture.useCases.listMarriages.execute(asA(), {
      page: 1,
      pageSize: 10,
    });

    expect(own.total).toBe(0);
  });

  describeCrossTenantIsolation('GetMarriage', {
    arrange: async () => {
      fixture = buildRecordsFixture();
      groom = fixture.world.person(1, 'Andrés Mora', { congregationId: 10 }).id;
      bride = fixture.world.person(1, 'Lucía Peña', { congregationId: 10 }).id;
      return (await fixture.useCases.recordMarriage.execute(asA(), command()))
        .id;
    },
    act: (scope: TenantScope, id: number) =>
      fixture.useCases.getMarriage.execute(
        tenantFor(scope, RECORDS_PERMISSIONS),
        id,
      ),
  });
});
