import {
  FakeAuditRecorder,
  FakeTransactionRunner,
  contextFor,
} from '../../../../test/support/accounting-doubles.js';
import {
  InMemoryAccountRepository,
  InMemoryFundRepository,
} from '../../../../test/support/accounting-setup-fakes.js';
import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import { TENANT_A } from '../../../../test/support/tenants.js';
import {
  AccountsService,
  type CreateAccountInput,
} from './accounts.service.js';

const sharedAccounts = new InMemoryAccountRepository();
const sharedService = new AccountsService(
  sharedAccounts,
  new InMemoryFundRepository(),
  new FakeTransactionRunner(),
  new FakeAuditRecorder(),
);

function setup() {
  const accounts = new InMemoryAccountRepository();
  const funds = new InMemoryFundRepository();
  const audit = new FakeAuditRecorder();
  const service = new AccountsService(
    accounts,
    funds,
    new FakeTransactionRunner(),
    audit,
  );
  return { accounts, funds, audit, service, treasurer: contextFor(TENANT_A) };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as { code?: string } | null;
  return error?.code ?? 'NO_ERROR';
}

const child = (
  parentId: number,
  overrides: Partial<CreateAccountInput> = {},
): CreateAccountInput => ({
  parentId,
  code: '410590',
  name: 'Ofrendas especiales',
  nature: 'INCOME',
  isPostable: true,
  defaultFundId: null,
  ...overrides,
});

describe('AccountsService', () => {
  it('lists the accounts of the denomination in tree order with depth and facts', async () => {
    const { accounts, funds, service, treasurer } = setup();
    const fund = funds.add(1, 'Fondo Local');
    const root = accounts.add(1, '4', { isPostable: false });
    const group = accounts.add(1, '4105', {
      parentId: root.id,
      isPostable: false,
    });
    const leaf = accounts.add(1, '410505', {
      parentId: group.id,
      defaultFundId: fund.id,
    });
    accounts.add(2, '9', { isPostable: false });
    accounts.setFacts(leaf.id, {
      hasMovements: true,
      linkedTypes: 1,
      activeLinkedTypes: 1,
    });

    const rows = await service.list(treasurer);

    expect(rows.map((r) => [r.code, r.depth])).toEqual([
      ['4', 0],
      ['4105', 1],
      ['410505', 2],
    ]);
    expect(rows[2]).toMatchObject({
      hasMovements: true,
      linkedTypes: 1,
      defaultFundName: 'Fondo Local',
    });
    expect(rows[0].hasChildren).toBe(true);
  });

  it('validates account codes: unique, numeric and prefixed by the parent', async () => {
    const { accounts, service, treasurer } = setup();
    const group = accounts.add(1, '4105', { isPostable: false });
    accounts.add(1, '410505', { parentId: group.id });

    expect(
      await codeOf(
        service.create(treasurer, child(group.id, { code: '410505' })),
      ),
    ).toBe('ACCOUNT_CODE_TAKEN');
    expect(
      await codeOf(
        service.create(treasurer, child(group.id, { code: '420599' })),
      ),
    ).toBe('ACCOUNT_CODE_PREFIX');
    expect(
      await codeOf(
        service.create(treasurer, child(group.id, { code: '41-05' })),
      ),
    ).toBe('ACCOUNT_CODE_INVALID');
    expect(
      await codeOf(
        service.create(treasurer, child(group.id, { nature: 'EXPENSE' })),
      ),
    ).toBe('ACCOUNT_NATURE_MISMATCH');

    const created = await service.create(treasurer, child(group.id));
    expect(created).toMatchObject({
      depth: 1,
      isPostable: true,
      code: '410590',
    });
  });

  it('lets two denominations use the same code', async () => {
    const { accounts, service, treasurer } = setup();
    accounts.add(2, '410505');

    await expect(
      service.create(treasurer, child(0, { parentId: null, code: '410505' })),
    ).resolves.toMatchObject({ code: '410505' });
  });

  it('turns an unused postable account into a group when it receives a child', async () => {
    const { accounts, audit, service, treasurer } = setup();
    const leaf = accounts.add(1, '510590');

    await service.create(
      treasurer,
      child(leaf.id, { code: '51059005', nature: 'INCOME' }),
    );

    expect(accounts.accounts.find((a) => a.id === leaf.id)?.isPostable).toBe(
      false,
    );
    expect(audit.last?.action).toBe('ACCOUNT_CREATED');
  });

  it('does not accept a child under an account that already has movements or contribution types', async () => {
    const { accounts, service, treasurer } = setup();
    const withMovements = accounts.add(1, '410505');
    const linked = accounts.add(1, '410510');
    accounts.setFacts(withMovements.id, { hasMovements: true });
    accounts.setFacts(linked.id, { linkedTypes: 1, activeLinkedTypes: 1 });

    expect(
      await codeOf(
        service.create(
          treasurer,
          child(withMovements.id, { code: '41050501' }),
        ),
      ),
    ).toBe('ACCOUNT_HAS_MOVEMENTS');
    expect(
      await codeOf(
        service.create(treasurer, child(linked.id, { code: '41051001' })),
      ),
    ).toBe('ACCOUNT_IN_USE');
  });

  it('never lets a parent with children be postable', async () => {
    const { accounts, service, treasurer } = setup();
    const group = accounts.add(1, '4105', { isPostable: false });
    accounts.add(1, '410505', { parentId: group.id });

    expect(
      await codeOf(
        service.update(treasurer, group.id, {
          code: '4105',
          name: 'Ingresos por aportes',
          isPostable: true,
          defaultFundId: null,
        }),
      ),
    ).toBe('ACCOUNT_HAS_CHILDREN');
  });

  it('locks the code of an account with children or movements', async () => {
    const { accounts, service, treasurer } = setup();
    const leaf = accounts.add(1, '510505', { nature: 'EXPENSE' });
    accounts.setFacts(leaf.id, { hasMovements: true });

    expect(
      await codeOf(
        service.update(treasurer, leaf.id, {
          code: '510599',
          name: 'Servicios públicos',
          isPostable: true,
          defaultFundId: null,
        }),
      ),
    ).toBe('ACCOUNT_CODE_LOCKED');
  });

  it('requires the suggested fund to exist in the denomination', async () => {
    const { accounts, funds, service, treasurer } = setup();
    const foreign = funds.add(2, 'Fondo de otra denominación');
    const leaf = accounts.add(1, '410505');

    expect(
      await codeOf(
        service.update(treasurer, leaf.id, {
          code: '410505',
          name: 'Diezmos',
          isPostable: true,
          defaultFundId: foreign.id,
        }),
      ),
    ).toBe('FUND_NOT_FOUND');
  });

  it('activates and deactivates, but not an account that feeds active contribution types', async () => {
    const { accounts, service, treasurer } = setup();
    const free = accounts.add(1, '410510');
    const fed = accounts.add(1, '410505');
    accounts.setFacts(fed.id, { linkedTypes: 1, activeLinkedTypes: 1 });

    await expect(
      service.setActive(treasurer, free.id, false),
    ).resolves.toMatchObject({
      isActive: false,
    });
    expect(await codeOf(service.setActive(treasurer, fed.id, false))).toBe(
      'ACCOUNT_IN_USE',
    );
  });

  it('deletes only accounts without children, movements or contribution types', async () => {
    const { accounts, service, treasurer } = setup();
    const group = accounts.add(1, '4105', { isPostable: false });
    const moved = accounts.add(1, '410505', { parentId: group.id });
    const free = accounts.add(1, '510595', { nature: 'EXPENSE' });
    accounts.setFacts(moved.id, { hasMovements: true });

    expect(await codeOf(service.remove(treasurer, group.id))).toBe(
      'ACCOUNT_HAS_CHILDREN',
    );
    expect(await codeOf(service.remove(treasurer, moved.id))).toBe(
      'ACCOUNT_HAS_MOVEMENTS',
    );
    await service.remove(treasurer, free.id);
    expect(accounts.accounts.some((a) => a.id === free.id)).toBe(false);
  });

  describeCrossTenantIsolation('updating an account', {
    congregationLevel: false,
    arrange: (owner) =>
      sharedAccounts.add(
        owner.denominationId,
        `${sharedAccounts.accounts.length + 1}`.padStart(4, '1'),
      ).id,
    act: (scope, id) =>
      sharedService.update(contextFor(scope), id, {
        code: sharedAccounts.accounts.find((a) => a.id === id)?.code ?? '1',
        name: 'Nombre nuevo',
        isPostable: true,
        defaultFundId: null,
      }),
  });

  describeCrossTenantIsolation('deleting an account', {
    congregationLevel: false,
    arrange: (owner) =>
      sharedAccounts.add(
        owner.denominationId,
        `9${sharedAccounts.accounts.length}`,
      ).id,
    act: (scope, id) => sharedService.remove(contextFor(scope), id),
  });

  describeCrossTenantIsolation('toggling an account', {
    congregationLevel: false,
    arrange: (owner) =>
      sharedAccounts.add(
        owner.denominationId,
        `8${sharedAccounts.accounts.length}`,
      ).id,
    act: (scope, id) => sharedService.setActive(contextFor(scope), id, true),
  });
});
