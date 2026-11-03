import { DocumentNumberingService } from '../../../common/numbering/document-numbering.service.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { buildTenantContext } from '../../../../test/support/tenants.js';
import {
  AccountingWorld,
  FakeAuditRecorder,
  FakeContributionsRepository,
  FakeContributorsRepository,
  FakeVowsRepository,
  FixedClock,
} from './accounting-world.js';

export const TODAY = '2026-11-02';

export const TYPE = {
  tithe: 1,
  offering: 2,
  vow: 3,
  inactive: 4,
  brokenAccount: 5,
  otherDenominationTithe: 50,
} as const;

export const PERSON = {
  ana: 1,
  luis: 2,
  deceased: 3,
  otherDenomination: 9,
} as const;

/**
 * Two denominations: the first with two sedes (10 Central, 11 Norte), the second with one (20).
 * November 2026 is open everywhere, October 2026 is closed in Central.
 */
export function buildWorld(): AccountingWorld {
  const world = new AccountingWorld();
  world.congregations.set(10, {
    id: 10,
    denominationId: 1,
    name: 'Sede Central',
    code: 'SC',
  });
  world.congregations.set(11, {
    id: 11,
    denominationId: 1,
    name: 'Sede Norte',
    code: 'SN',
  });
  world.congregations.set(20, {
    id: 20,
    denominationId: 2,
    name: 'Sede Sion',
    code: 'SS',
  });

  world.types.push(
    {
      id: TYPE.tithe,
      denominationId: 1,
      name: 'Diezmo',
      category: 'TITHE',
      isActive: true,
      accountUsable: true,
    },
    {
      id: TYPE.offering,
      denominationId: 1,
      name: 'Ofrenda',
      category: 'OFFERING',
      isActive: true,
      accountUsable: true,
    },
    {
      id: TYPE.vow,
      denominationId: 1,
      name: 'Voto',
      category: 'VOW',
      isActive: true,
      accountUsable: true,
      fundName: 'Fondo de Construcción',
    },
    {
      id: TYPE.inactive,
      denominationId: 1,
      name: 'Ofrenda 2025',
      category: 'OFFERING',
      isActive: false,
      accountUsable: true,
    },
    {
      id: TYPE.brokenAccount,
      denominationId: 1,
      name: 'Primicia',
      category: 'FIRST_FRUITS',
      isActive: true,
      accountUsable: false,
    },
    {
      id: TYPE.otherDenominationTithe,
      denominationId: 2,
      name: 'Diezmo',
      category: 'TITHE',
      isActive: true,
      accountUsable: true,
    },
  );

  world.persons.push(
    {
      id: PERSON.ana,
      denominationId: 1,
      firstName: 'Ana',
      lastName: 'Pérez',
      documentTypeCode: 'CC',
      documentNumber: '52341904',
      memberNumber: 130,
      congregationId: 10,
    },
    {
      id: PERSON.luis,
      denominationId: 1,
      firstName: 'Luis',
      lastName: 'Gómez',
      documentTypeCode: 'CC',
      documentNumber: '79123456',
      memberNumber: 4,
      congregationId: 11,
    },
    {
      id: PERSON.deceased,
      denominationId: 1,
      firstName: 'Anselmo',
      lastName: 'Rojas',
      documentTypeCode: 'CC',
      documentNumber: '1000',
      memberNumber: 7,
      congregationId: 10,
      deceased: true,
    },
    {
      id: PERSON.otherDenomination,
      denominationId: 2,
      firstName: 'Ana',
      lastName: 'Cruz',
      documentTypeCode: 'CC',
      documentNumber: '4444',
      memberNumber: 1,
      congregationId: 20,
    },
  );

  world.periods.push(
    {
      denominationId: 1,
      congregationId: 10,
      year: 2026,
      month: 11,
      status: 'OPEN',
    },
    {
      denominationId: 1,
      congregationId: 10,
      year: 2026,
      month: 10,
      status: 'CLOSED',
    },
    {
      denominationId: 1,
      congregationId: 11,
      year: 2026,
      month: 11,
      status: 'OPEN',
    },
    {
      denominationId: 2,
      congregationId: 20,
      year: 2026,
      month: 11,
      status: 'OPEN',
    },
  );
  return world;
}

/** Everything a use case needs, wired to the fakes of one world. */
export function buildKit(world: AccountingWorld = buildWorld()) {
  const audit = new FakeAuditRecorder();
  const clock = new FixedClock(TODAY);
  const numbering = new DocumentNumberingService(
    world.sequences,
    world.transactions,
  );
  return {
    world,
    audit,
    clock,
    numbering,
    transactions: world.transactions,
    contributions: new FakeContributionsRepository(world),
    contributors: new FakeContributorsRepository(world),
    vows: new FakeVowsRepository(world),
  };
}

const TREASURER = ['contributions.read', 'contributions.write'];

/** The treasurer (or another role) acting in the sede or denomination of `scope`. */
export function actingIn(
  scope: TenantScope,
  permissions: readonly string[] = TREASURER,
) {
  return buildTenantContext({
    kind: scope.congregationId === null ? 'DENOMINATION' : 'CONGREGATION',
    denominationId: scope.denominationId,
    congregationId: scope.congregationId,
    permissions,
  });
}
