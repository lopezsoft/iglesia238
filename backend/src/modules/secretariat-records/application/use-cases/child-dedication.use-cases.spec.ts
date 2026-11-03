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
import type { RecordDedicationCommand } from './child-dedication.use-cases.js';

let fixture: RecordsFixture;
let child: number;
let father: number;
let mother: number;
let pastor: number;

const asA = () => tenantFor(TENANT_A, RECORDS_PERMISSIONS, 7);

beforeEach(() => {
  fixture = buildRecordsFixture();
  child = fixture.world.person(1, 'Sofía Mora', {
    birthDate: '2024-03-14',
    sex: 'FEMALE',
  }).id;
  father = fixture.world.person(1, 'Andrés Mora', {
    congregationId: 10,
    sex: 'MALE',
  }).id;
  mother = fixture.world.person(1, 'Lucía Peña', {
    congregationId: 10,
    sex: 'FEMALE',
  }).id;
  pastor = fixture.world.person(1, 'Daniel Herrera', { congregationId: 10 }).id;
});

function command(
  overrides: Partial<RecordDedicationCommand> = {},
): RecordDedicationCommand {
  return {
    congregationId: 10,
    childId: child,
    dedicatedOn: '2026-10-25',
    pastorId: pastor,
    father: { personId: father },
    mother: { personId: null, name: '  Gloria Muñoz ' },
    ...overrides,
  };
}

describe('RecordChildDedication', () => {
  it('records a dedication with a registered parent and a parent given only by name', async () => {
    const created = await fixture.useCases.recordDedication.execute(
      asA(),
      command(),
    );

    expect(created.father).toMatchObject({
      personId: father,
      name: 'Andrés Mora',
    });
    expect(created.mother).toMatchObject({
      name: 'Gloria Muñoz',
      memberCode: null,
    });
    expect(created.mother?.personId).not.toBeNull();
    expect(created.child.maskedDocument).toMatch(/^CC ···· \d{4}$/);
    expect(created.pastor?.id).toBe(pastor);
    expect(fixture.transactions.runs).toBe(1);
  });

  it('audits the record without names or documents', async () => {
    const created = await fixture.useCases.recordDedication.execute(
      asA(),
      command(),
    );

    expect(fixture.audit.last).toMatchObject({
      action: 'CHILD_DEDICATION_RECORDED',
      entity: 'ChildDedication',
      entityId: created.id,
      changes: {
        congregationId: { from: null, to: 10 },
        dedicatedOn: { from: null, to: '2026-10-25' },
      },
    });
    expect(JSON.stringify(fixture.audit.entries)).not.toContain('Sofía');
  });

  it('accepts a guardian as the only link', async () => {
    const created = await fixture.useCases.recordDedication.execute(
      asA(),
      command({ father: null, mother: null, guardian: { personId: mother } }),
    );

    expect(created.guardian).toMatchObject({ personId: mother });
    expect(created.father).toBeNull();
  });

  it('requires at least one parent or guardian and refuses a child as their own parent', async () => {
    await expect(
      fixture.useCases.recordDedication.execute(
        asA(),
        command({ father: null, mother: { name: '   ' } }),
      ),
    ).rejects.toMatchObject({ code: 'PARENT_REQUIRED' });
    await expect(
      fixture.useCases.recordDedication.execute(
        asA(),
        command({ father: { personId: child } }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PARENT' });
    await expect(
      fixture.useCases.recordDedication.execute(
        asA(),
        command({ father: { personId: father }, mother: { personId: father } }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PARENT' });
    await expect(
      fixture.useCases.recordDedication.execute(
        asA(),
        command({ mother: { name: 'x'.repeat(121) } }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PARENT' });
  });

  it('rejects a date before the birth, in the future or impossible', async () => {
    await expect(
      fixture.useCases.recordDedication.execute(
        asA(),
        command({ dedicatedOn: '2024-03-13' }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_DATE' });
    await expect(
      fixture.useCases.recordDedication.execute(
        asA(),
        command({ dedicatedOn: '2026-11-03' }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_DATE' });
    await expect(
      fixture.useCases.recordDedication.execute(
        asA(),
        command({ dedicatedOn: '2026-13-01' }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_DATE' });
    expect(fixture.world.dedications).toHaveLength(0);
  });

  it('presents a child only once', async () => {
    await fixture.useCases.recordDedication.execute(asA(), command());

    await expect(
      fixture.useCases.recordDedication.execute(asA(), command()),
    ).rejects.toMatchObject({
      code: 'DEDICATION_ALREADY_RECORDED',
    });
    expect(fixture.world.dedications).toHaveLength(1);
  });

  it('does not create the parent person when the dedication is rejected', async () => {
    const before = fixture.world.people.length;

    await expect(
      fixture.useCases.recordDedication.execute(
        asA(),
        command({ dedicatedOn: '2026-11-03' }),
      ),
    ).rejects.toBeDefined();

    expect(fixture.world.people).toHaveLength(before);
  });

  it('rejects a child or parent who is a member of another sede', async () => {
    const northChild = fixture.world.person(1, 'Hijo del Norte', {
      congregationId: 11,
      birthDate: '2022-02-02',
    }).id;
    const northMother = fixture.world.person(1, 'Madre del Norte', {
      congregationId: 11,
    }).id;

    await expect(
      fixture.useCases.recordDedication.execute(
        asA(),
        command({ childId: northChild }),
      ),
    ).rejects.toMatchObject({ code: 'OUT_OF_SCOPE' });
    await expect(
      fixture.useCases.recordDedication.execute(
        asA(),
        command({ mother: { personId: northMother } }),
      ),
    ).rejects.toMatchObject({ code: 'OUT_OF_SCOPE' });
  });

  it('answers 404 for people of another denomination and for sedes outside the scope', async () => {
    const stranger = fixture.world.person(2, 'Persona Ajena', {
      birthDate: '2024-01-01',
    }).id;

    await expect(
      fixture.useCases.recordDedication.execute(
        asA(),
        command({ childId: stranger }),
      ),
    ).rejects.toMatchObject({ code: 'PERSON_NOT_FOUND' });
    await expect(
      fixture.useCases.recordDedication.execute(
        asA(),
        command({ pastorId: stranger }),
      ),
    ).rejects.toMatchObject({ code: 'PERSON_NOT_FOUND' });
    await expect(
      fixture.useCases.recordDedication.execute(
        asA(),
        command({ congregationId: 11 }),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      fixture.useCases.recordDedication.execute(
        tenantFor(TENANT_A_WIDE, RECORDS_PERMISSIONS),
        command({ congregationId: 20 }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  describeCrossTenantIsolation('RecordChildDedication', {
    arrange: () => {
      fixture = buildRecordsFixture();
      child = fixture.world.person(1, 'Sofía Mora', {
        birthDate: '2024-03-14',
      }).id;
      father = fixture.world.person(1, 'Andrés Mora', {
        congregationId: 10,
      }).id;
      pastor = fixture.world.person(1, 'Daniel Herrera', {
        congregationId: 10,
      }).id;
      return 10;
    },
    act: (scope: TenantScope, congregationId: number) =>
      fixture.useCases.recordDedication.execute(
        tenantFor(scope, RECORDS_PERMISSIONS),
        command({ congregationId, mother: null }),
      ),
  });
});

describe('ListChildDedications and GetChildDedication', () => {
  async function record(name: string, date: string) {
    const kid = fixture.world.person(1, name, { birthDate: '2020-01-01' }).id;
    return fixture.useCases.recordDedication.execute(
      asA(),
      command({ childId: kid, dedicatedOn: date, mother: null }),
    );
  }

  it('lists the most recent first, filters by name and date, and pages on the server', async () => {
    await record('Ana Gómez', '2026-03-01');
    await record('Beto Gómez', '2026-09-01');
    await record('Carla Ruiz', '2026-06-01');

    const first = await fixture.useCases.listDedications.execute(asA(), {
      page: 1,
      pageSize: 2,
    });
    const byName = await fixture.useCases.listDedications.execute(asA(), {
      page: 1,
      pageSize: 10,
      q: 'gómez',
    });
    const byDate = await fixture.useCases.listDedications.execute(asA(), {
      page: 1,
      pageSize: 10,
      from: '2026-05-01',
      to: '2026-07-01',
    });

    expect(first.total).toBe(3);
    expect(first.items.map((row) => row.child.fullName)).toEqual([
      'Beto Gómez',
      'Carla Ruiz',
    ]);
    expect(byName.items).toHaveLength(2);
    expect(byDate.items.map((row) => row.child.fullName)).toEqual([
      'Carla Ruiz',
    ]);
  });

  it('never lists the dedications of another sede or denomination', async () => {
    await record('Ana Gómez', '2026-03-01');

    const sibling = await fixture.useCases.listDedications.execute(
      tenantFor(TENANT_A_SIBLING, RECORDS_PERMISSIONS),
      { page: 1, pageSize: 10 },
    );
    const other = await fixture.useCases.listDedications.execute(
      tenantFor(TENANT_B, RECORDS_PERMISSIONS),
      {
        page: 1,
        pageSize: 10,
      },
    );

    expect(sibling.total).toBe(0);
    expect(other.total).toBe(0);
  });

  it('audits every individual consultation of a record about a minor, with the viewer and the record only', async () => {
    const created = await record('Ana Gómez', '2026-03-01');
    fixture.audit.entries.length = 0;

    const found = await fixture.useCases.getDedication.execute(
      asA(),
      created.id,
      '10.0.0.7',
    );

    expect(found.id).toBe(created.id);
    expect(fixture.audit.entries).toHaveLength(1);
    expect(fixture.audit.last).toMatchObject({
      action: 'CHILD_DEDICATION_VIEWED',
      entity: 'ChildDedication',
      entityId: created.id,
      actor: { userId: 7 },
      ipAddress: '10.0.0.7',
    });
    expect(fixture.audit.last?.changes).toBeUndefined();
  });

  describeCrossTenantIsolation('GetChildDedication', {
    arrange: async () => {
      fixture = buildRecordsFixture();
      child = fixture.world.person(1, 'Sofía Mora', {
        birthDate: '2024-03-14',
      }).id;
      father = fixture.world.person(1, 'Andrés Mora', {
        congregationId: 10,
      }).id;
      pastor = fixture.world.person(1, 'Daniel Herrera', {
        congregationId: 10,
      }).id;
      return (
        await fixture.useCases.recordDedication.execute(
          asA(),
          command({ mother: null }),
        )
      ).id;
    },
    act: (scope: TenantScope, id: number) =>
      fixture.useCases.getDedication.execute(
        tenantFor(scope, RECORDS_PERMISSIONS),
        id,
      ),
  });

  it('leaves no audit entry when the record is not visible', async () => {
    const created = await record('Ana Gómez', '2026-03-01');
    fixture.audit.entries.length = 0;

    await expect(
      fixture.useCases.getDedication.execute(
        tenantFor(TENANT_B, RECORDS_PERMISSIONS),
        created.id,
      ),
    ).rejects.toMatchObject({ code: 'DEDICATION_NOT_FOUND' });
    expect(fixture.audit.entries).toHaveLength(0);
  });
});
