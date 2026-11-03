import {
  FakeAuditRecorder,
  FakeTransactionRunner,
  contextFor,
} from '../../../../test/support/accounting-doubles.js';
import {
  InMemoryAccountRepository,
  InMemoryContributionTypeRepository,
} from '../../../../test/support/accounting-setup-fakes.js';
import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import { TENANT_A } from '../../../../test/support/tenants.js';
import { ContributionTypesService } from './contribution-types.service.js';

function build() {
  const accounts = new InMemoryAccountRepository();
  const types = new InMemoryContributionTypeRepository(accounts);
  const audit = new FakeAuditRecorder();
  const service = new ContributionTypesService(
    types,
    accounts,
    new FakeTransactionRunner(),
    audit,
  );
  return { accounts, types, audit, service };
}

const shared = build();

function setup() {
  return { ...build(), treasurer: contextFor(TENANT_A) };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as { code?: string } | null;
  return error?.code ?? 'NO_ERROR';
}

describe('ContributionTypesService', () => {
  it('lists only the types of the denomination', async () => {
    const { accounts, types, service, treasurer } = setup();
    const own = accounts.add(1, '410505');
    const foreign = accounts.add(2, '410505');
    types.add(1, 'DIEZMO', own.id, { category: 'TITHE' });
    types.add(2, 'DIEZMO', foreign.id);

    const rows = await service.list(treasurer);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: 'DIEZMO', accountCode: '410505' });
  });

  it('links a type only to a postable, active income account', async () => {
    const { accounts, service, treasurer } = setup();
    const group = accounts.add(1, '4105', { isPostable: false });
    const expense = accounts.add(1, '510505', { nature: 'EXPENSE' });
    const inactive = accounts.add(1, '410599', { isActive: false });
    const base = {
      code: 'GRACIAS',
      name: 'Ofrenda de acción de gracias',
      category: 'OFFERING' as const,
    };

    for (const account of [group, expense, inactive]) {
      expect(
        await codeOf(
          service.create(treasurer, { ...base, accountId: account.id }),
        ),
      ).toBe('TYPE_ACCOUNT_INVALID');
    }
  });

  it('does not use an account of another denomination', async () => {
    const { accounts, service, treasurer } = setup();
    const foreign = accounts.add(2, '410505');

    expect(
      await codeOf(
        service.create(treasurer, {
          code: 'DIEZMO',
          name: 'Diezmo',
          category: 'TITHE',
          accountId: foreign.id,
        }),
      ),
    ).toBe('TYPE_ACCOUNT_INVALID');
  });

  it('creates an active type with the code in capitals and audits it', async () => {
    const { accounts, audit, service, treasurer } = setup();
    const income = accounts.add(1, '410510');

    const created = await service.create(treasurer, {
      code: ' gracias ',
      name: 'Ofrenda de acción de gracias',
      category: 'OFFERING',
      accountId: income.id,
    });

    expect(created).toMatchObject({
      code: 'GRACIAS',
      isActive: true,
      accountCode: '410510',
    });
    expect(audit.last).toMatchObject({
      action: 'CONTRIBUTION_TYPE_CREATED',
      entity: 'ContributionType',
    });
  });

  it('validates code, name, category and uniqueness', async () => {
    const { accounts, types, service, treasurer } = setup();
    const income = accounts.add(1, '410510');
    types.add(1, 'DIEZMO', income.id);
    const base = {
      code: 'GRACIAS',
      name: 'Acción de gracias',
      category: 'OFFERING' as const,
      accountId: income.id,
    };

    expect(
      await codeOf(service.create(treasurer, { ...base, code: 'a' })),
    ).toBe('TYPE_CODE_INVALID');
    expect(
      await codeOf(service.create(treasurer, { ...base, name: 'ab' })),
    ).toBe('INVALID_NAME');
    expect(
      await codeOf(
        service.create(treasurer, { ...base, category: 'X' as never }),
      ),
    ).toBe('INVALID_CATEGORY');
    expect(
      await codeOf(service.create(treasurer, { ...base, code: 'diezmo' })),
    ).toBe('TYPE_CODE_TAKEN');
  });

  it('does not change the category of a type that already has contributions', async () => {
    const { accounts, types, service, treasurer } = setup();
    const income = accounts.add(1, '410505');
    const tithe = types.add(1, 'DIEZMO', income.id, {
      category: 'TITHE',
      contributionCount: 12,
    });

    expect(
      await codeOf(
        service.update(treasurer, tithe.id, {
          code: 'DIEZMO',
          name: 'Diezmo',
          category: 'OFFERING',
          accountId: income.id,
        }),
      ),
    ).toBe('TYPE_IN_USE');
  });

  it('toggles a type and audits the change', async () => {
    const { accounts, types, audit, service, treasurer } = setup();
    const income = accounts.add(1, '410505');
    const type = types.add(1, 'DIEZMO', income.id);

    const inactive = await service.setActive(treasurer, type.id, false);

    expect(inactive.isActive).toBe(false);
    expect(audit.last?.changes?.isActive).toEqual({ from: true, to: false });
  });

  describeCrossTenantIsolation('updating a contribution type', {
    congregationLevel: false,
    arrange: (owner) => {
      const account = shared.accounts.add(
        owner.denominationId,
        `${shared.accounts.accounts.length + 1}0`,
      );
      return shared.types.add(
        owner.denominationId,
        `T${shared.types.types.length}`,
        account.id,
      ).id;
    },
    act: (scope, id) => {
      const type = shared.types.types.find((t) => t.id === id)!;
      return shared.service.update(contextFor(scope), id, {
        code: type.code,
        name: 'Nombre nuevo',
        category: type.category,
        accountId: type.accountId,
      });
    },
  });

  describeCrossTenantIsolation('toggling a contribution type', {
    congregationLevel: false,
    arrange: (owner) => {
      const account = shared.accounts.add(
        owner.denominationId,
        `${shared.accounts.accounts.length + 1}1`,
      );
      return shared.types.add(
        owner.denominationId,
        `U${shared.types.types.length}`,
        account.id,
      ).id;
    },
    act: (scope, id) => shared.service.setActive(contextFor(scope), id, false),
  });
});
