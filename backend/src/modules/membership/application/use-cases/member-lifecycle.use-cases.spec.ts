import {
  TENANT_A,
  TENANT_A_WIDE,
} from '../../../../../test/support/tenants.js';
import { describeCrossTenantIsolation } from '../../../../../test/support/cross-tenant.js';
import { commandContext } from '../testing/context.js';
import { buildMembershipFakes } from '../testing/in-memory-membership.js';
import {
  ChangeMemberStatusUseCase,
  GetMemberRegistryUseCase,
  ListTransferDestinationsUseCase,
  TransferMemberUseCase,
} from './member-lifecycle.use-cases.js';

function setup() {
  const fakes = buildMembershipFakes();
  const { store } = fakes;
  store.positionCatalog.push({
    id: 1,
    denominationId: 1,
    name: 'Diácono',
    isActive: true,
  });
  const member = store.seedMember(1, 10, {
    person: { firstName: 'Ana', lastName: 'Rojas' },
  });
  store.positions.push({
    id: 900,
    denominationId: 1,
    memberId: member.id,
    positionId: 1,
    startedOn: '2024-01-01',
    endedOn: null,
  });
  return {
    ...fakes,
    member,
    status: new ChangeMemberStatusUseCase(
      fakes.members,
      fakes.registry,
      fakes.positions,
      fakes.transactions,
      fakes.audit,
      fakes.numbering,
      fakes.clock,
    ),
    transfer: new TransferMemberUseCase(
      fakes.members,
      fakes.registry,
      fakes.positions,
      fakes.transactions,
      fakes.audit,
      fakes.numbering,
      fakes.clock,
    ),
    registryView: new GetMemberRegistryUseCase(fakes.members, fakes.registry),
    destinations: new ListTransferDestinationsUseCase(
      fakes.members,
      fakes.registry,
    ),
  };
}

describe('ChangeMemberStatusUseCase', () => {
  it('deactivates a member, closes the open positions and records the history', async () => {
    const { status, member, store } = setup();

    const detail = await status.execute(commandContext(TENANT_A), member.id, {
      status: 'INACTIVE',
      reason: 'Dejó de congregarse',
      effectiveOn: null,
    });

    expect(detail.status).toBe('INACTIVE');
    expect(store.positions[0].endedOn).toBe('2026-11-02');
    expect(store.histories.at(-1)).toMatchObject({
      status: 'INACTIVE',
      reason: 'Dejó de congregarse',
      startedOn: '2026-11-02',
    });
    expect(store.audit.at(-1)).toMatchObject({
      action: 'MEMBER_STATUS_CHANGED',
      changes: { status: { from: 'ACTIVE', to: 'INACTIVE' } },
    });
    // The registry stays open: an inactive member still belongs to the congregation.
    expect(store.registry[0].endedOn).toBeNull();
  });

  it('closes the registry entry of a deceased member and does not let them return', async () => {
    const { status, member, store } = setup();
    const context = commandContext(TENANT_A);

    await status.execute(context, member.id, {
      status: 'DECEASED',
      reason: 'Falleció',
      effectiveOn: '2026-10-30',
    });

    expect(store.registry[0].endedOn).toBe('2026-10-30');
    await expect(
      status.execute(context, member.id, {
        status: 'ACTIVE',
        reason: null,
        effectiveOn: null,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_CHANGE' });
  });

  it('opens a new registry entry with the next number when a transferred member comes back', async () => {
    const { status, transfer, member, store } = setup();
    const context = commandContext(TENANT_A);
    await transfer.execute(context, member.id, {
      kind: 'EXTERNAL',
      externalDestinationName: 'Iglesia El Redil',
      transferDate: '2026-11-01',
      reason: 'Cambio de ciudad',
    });
    expect(store.registry.every((row) => row.endedOn !== null)).toBe(true);

    const detail = await status.execute(context, member.id, {
      status: 'ACTIVE',
      reason: null,
      effectiveOn: '2026-11-02',
    });

    expect(detail.status).toBe('ACTIVE');
    const open = store.registry.filter((row) => row.endedOn === null);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      congregationId: 10,
      startedOn: '2026-11-02',
      memberNumber: 1,
    });
  });

  it('refuses unchanged, manual TRANSFERRED and unexplained changes', async () => {
    const { status, member } = setup();
    const context = commandContext(TENANT_A);
    const run = (
      to: 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED',
      reason: string | null,
    ) =>
      status.execute(context, member.id, {
        status: to,
        reason,
        effectiveOn: null,
      });

    await expect(run('ACTIVE', null)).rejects.toMatchObject({
      code: 'STATUS_UNCHANGED',
    });
    await expect(run('TRANSFERRED', 'x')).rejects.toMatchObject({
      code: 'INVALID_STATUS_CHANGE',
    });
    await expect(run('INACTIVE', null)).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
    });
  });

  const fixture = setup();
  describeCrossTenantIsolation('ChangeMemberStatusUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) =>
      fixture.status.execute(commandContext(scope), id, {
        status: 'INACTIVE',
        reason: 'Motivo de prueba',
        effectiveOn: null,
      }),
  });
});

describe('TransferMemberUseCase', () => {
  it('moves a member to another congregation with the next number there and closes the current entry', async () => {
    const { transfer, member, store } = setup();

    const result = await transfer.execute(commandContext(TENANT_A), member.id, {
      kind: 'INTERNAL',
      destinationCongregationId: 11,
      transferDate: '2026-11-02',
      reason: 'Cambio de residencia',
    });

    expect(result).toEqual({
      kind: 'INTERNAL',
      destinationName: 'Sede SN',
      stillVisible: false,
    });
    expect(
      store.registry.find(
        (row) => row.memberId === member.id && row.congregationId === 10,
      )?.endedOn,
    ).toBe('2026-11-02');
    const current = store.registry.find(
      (row) => row.memberId === member.id && row.endedOn === null,
    );
    expect(current).toMatchObject({ congregationId: 11, memberNumber: 1 });
    expect(
      store.members.find((row) => row.id === member.id)?.congregationId,
    ).toBe(11);
    expect(store.transfers.at(-1)).toMatchObject({
      originCongregationId: 10,
      destinationCongregationId: 11,
      notes: 'Cambio de residencia',
      approvedById: 7,
    });
    expect(store.audit.at(-1)).toMatchObject({ action: 'MEMBER_TRANSFERRED' });
  });

  it('keeps the member visible when the user acts on the whole denomination', async () => {
    const { transfer, member } = setup();

    const result = await transfer.execute(
      commandContext(TENANT_A_WIDE),
      member.id,
      {
        kind: 'INTERNAL',
        destinationCongregationId: 11,
        transferDate: '2026-11-02',
        reason: 'Otro',
      },
    );

    expect(result.stillVisible).toBe(true);
  });

  it('marks an external transfer as TRANSFERRED, closes the registry and the open positions', async () => {
    const { transfer, member, store } = setup();

    const result = await transfer.execute(commandContext(TENANT_A), member.id, {
      kind: 'EXTERNAL',
      externalDestinationName: 'Iglesia Bautista El Redil',
      transferDate: '2026-11-02',
      reason: 'Otro',
    });

    expect(result.stillVisible).toBe(true);
    expect(store.members[0].status).toBe('TRANSFERRED');
    expect(store.registry[0].endedOn).toBe('2026-11-02');
    expect(store.positions[0].endedOn).toBe('2026-11-02');
    expect(store.histories.at(-1)).toMatchObject({ status: 'TRANSFERRED' });
    expect(
      store.audit.filter((entry) => entry.entity === 'MemberPosition'),
    ).toHaveLength(1);
  });

  it('rejects the current congregation, inactive members, other denominations and bad dates', async () => {
    const { transfer, member, store } = setup();
    const context = commandContext(TENANT_A);
    const internal = (
      destinationCongregationId: number,
      transferDate = '2026-11-02',
    ) =>
      transfer.execute(context, member.id, {
        kind: 'INTERNAL',
        destinationCongregationId,
        transferDate,
        reason: 'Otro',
      });

    await expect(internal(10)).rejects.toMatchObject({
      code: 'SAME_CONGREGATION',
    });
    await expect(internal(20)).rejects.toMatchObject({
      code: 'INVALID_DESTINATION',
    });
    await expect(internal(11, '2999-01-01')).rejects.toMatchObject({
      code: 'INVALID_DATE',
    });
    await expect(internal(11, '2010-01-01')).rejects.toMatchObject({
      code: 'INVALID_DATE',
    });

    store.members[0].status = 'INACTIVE';
    await expect(internal(11)).rejects.toMatchObject({
      code: 'MEMBER_NOT_ACTIVE',
    });
  });

  const fixture = setup();
  describeCrossTenantIsolation('TransferMemberUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) =>
      fixture.transfer.execute(commandContext(scope), id, {
        kind: 'EXTERNAL',
        externalDestinationName: 'Iglesia Externa',
        transferDate: '2026-11-02',
        reason: 'Otro',
      }),
  });
});

describe('registry and destinations', () => {
  it('lists the active congregations of the denomination except the current one', async () => {
    const { destinations, member, store } = setup();
    store.seedCongregation(13, 1, 'SI', false);

    const options = await destinations.execute(TENANT_A, member.id);

    expect(options.map((option) => option.id)).toEqual([11]);
  });

  const fixture = setup();
  describeCrossTenantIsolation('GetMemberRegistryUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) => fixture.registryView.execute(scope, id),
  });
  describeCrossTenantIsolation('ListTransferDestinationsUseCase', {
    arrange: (owner) =>
      fixture.store.seedMember(owner.denominationId, owner.congregationId ?? 10)
        .id,
    act: (scope, id) => fixture.destinations.execute(scope, id),
  });
});
