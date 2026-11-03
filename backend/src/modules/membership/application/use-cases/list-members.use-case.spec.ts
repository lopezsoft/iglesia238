import {
  TENANT_A,
  TENANT_A_SIBLING,
  TENANT_A_WIDE,
  TENANT_B,
} from '../../../../../test/support/tenants.js';
import { describeCrossTenantIsolation } from '../../../../../test/support/cross-tenant.js';
import { NotFoundDomainException } from '../../../../common/errors/domain.exception.js';
import { commandContext } from '../testing/context.js';
import { buildMembershipFakes } from '../testing/in-memory-membership.js';
import {
  ExportMembersUseCase,
  ListMembersUseCase,
  MemberFiltersInput,
} from './list-members.use-case.js';
import { GetMemberUseCase } from './member-profile.use-cases.js';

const ALL: MemberFiltersInput = {
  text: '',
  status: 'ALL',
  sex: 'ALL',
  ageRange: 'ALL',
  position: 'ALL',
  congregationId: null,
};
const PAGING = { page: 1, pageSize: 25, sortBy: 'name', order: 'asc' } as const;

function setup() {
  const fakes = buildMembershipFakes();
  const { store } = fakes;
  const central = store.seedMember(1, 10, {
    person: { firstName: 'Ana', lastName: 'Rojas' },
  });
  const north = store.seedMember(1, 11, {
    person: { firstName: 'Luis', lastName: 'Pardo' },
  });
  const foreign = store.seedMember(2, 20, {
    person: { firstName: 'Zoe', lastName: 'Otra' },
  });
  return {
    ...fakes,
    central,
    north,
    foreign,
    list: new ListMembersUseCase(fakes.members, fakes.clock),
    exporter: new ExportMembersUseCase(fakes.members, fakes.audit, fakes.clock),
    get: new GetMemberUseCase(fakes.members),
  };
}

describe('ListMembersUseCase', () => {
  it('lists only the members of the congregation of the scope', async () => {
    const { list, central } = setup();

    const page = await list.execute(TENANT_A, { ...ALL, ...PAGING });

    expect(page.items.map((row) => row.id)).toEqual([central.id]);
    expect(page.statusCounts.ALL).toBe(1);
    expect(page.items[0].code).toBe('SC-0001');
  });

  it('lists every congregation of the denomination, and only it, for a denomination scope', async () => {
    const { list, central, north, foreign } = setup();

    const page = await list.execute(TENANT_A_WIDE, { ...ALL, ...PAGING });

    expect(page.items.map((row) => row.id).sort()).toEqual(
      [central.id, north.id].sort(),
    );
    expect(page.items.map((row) => row.id)).not.toContain(foreign.id);
  });

  it('narrows a denomination scope to one congregation and refuses another one in a congregation scope', async () => {
    const { list, north } = setup();

    const narrowed = await list.execute(TENANT_A_WIDE, {
      ...ALL,
      ...PAGING,
      congregationId: 11,
    });
    expect(narrowed.items.map((row) => row.id)).toEqual([north.id]);

    await expect(
      list.execute(TENANT_A, { ...ALL, ...PAGING, congregationId: 11 }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('counts per status ignoring the status filter', async () => {
    const { list, store, central } = setup();
    store.seedMember(1, 10, {
      status: 'INACTIVE',
      person: { firstName: 'Eva', lastName: 'Gil' },
    });

    const page = await list.execute(TENANT_A, {
      ...ALL,
      ...PAGING,
      status: 'INACTIVE',
    });

    expect(page.total).toBe(1);
    expect(page.statusCounts).toMatchObject({ ALL: 2, ACTIVE: 1, INACTIVE: 1 });
    expect(page.items.map((row) => row.id)).not.toContain(central.id);
  });

  it('filters by age range using birth dates and returns the age', async () => {
    const { list, store } = setup();
    const senior = store.seedMember(1, 10, {
      person: { firstName: 'Abuelo', lastName: 'Gil', birthDate: '1950-03-01' },
    });

    const page = await list.execute(TENANT_A, {
      ...ALL,
      ...PAGING,
      ageRange: 'SENIORS',
    });

    expect(page.items.map((row) => row.id)).toEqual([senior.id]);
    expect(page.items[0].age).toBe(76);
  });

  it('paginates', async () => {
    const { list, store } = setup();
    store.seedMember(1, 10, { person: { firstName: 'Eva', lastName: 'Gil' } });

    const page = await list.execute(TENANT_A, {
      ...ALL,
      page: 2,
      pageSize: 1,
      sortBy: 'name',
      order: 'asc',
    });

    expect(page).toMatchObject({ page: 2, pageSize: 1, total: 2 });
    expect(page.items).toHaveLength(1);
  });
});

describe('ExportMembersUseCase', () => {
  it('exports every filtered row as CSV and audits only the count', async () => {
    const { exporter, store } = setup();

    const result = await exporter.execute(commandContext(TENANT_A), ALL);

    expect(result.rows).toBe(1);
    expect(result.fileName).toBe('miembros-2026-11-02.csv');
    expect(result.content.startsWith('﻿Carné;Nombre')).toBe(true);
    expect(store.audit.at(-1)).toMatchObject({
      action: 'MEMBERS_EXPORTED',
      entity: 'Member',
      changes: { rows: { from: null, to: 1 } },
    });
  });

  it('includes the Sede column only for a denomination scope and never leaves its tenant', async () => {
    const { exporter } = setup();

    const wide = await exporter.execute(commandContext(TENANT_A_WIDE), ALL);

    expect(wide.rows).toBe(2);
    expect(wide.content.split('\r\n')[0]).toContain(';Sede;');
    expect(wide.content).not.toContain('Zoe');
  });
});

describe('GetMemberUseCase', () => {
  const fixture = setup();
  describeCrossTenantIsolation('GetMemberUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) => fixture.get.execute(scope, id),
  });

  it('answers 404 for a member of another denomination or of a sibling congregation', async () => {
    const { get, central } = setup();

    await expect(get.execute(TENANT_B, central.id)).rejects.toBeInstanceOf(
      NotFoundDomainException,
    );
    await expect(
      get.execute(TENANT_A_SIBLING, central.id),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });
});
