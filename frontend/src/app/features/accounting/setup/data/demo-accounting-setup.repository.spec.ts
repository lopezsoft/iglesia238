import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../../core/auth/demo-auth.gateway';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { DomainError } from '../../../../core/errors/domain-error';
import { AccountingDemoStore } from '../../data/accounting-demo-store';
import { AccountingSetupRepository } from './accounting-setup.repository';
import { DemoAccountingSetupRepository } from './demo-accounting-setup.repository';

const TREASURER = 'jorge.ramirez@montedesion.example';
const PASTOR = 'daniel.herrera@montedesion.example';
const OTHER_DENOMINATION_ADMIN = 'ricardo.leon@vidanueva.example';

async function setup(email: string) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: DemoAuthGateway },
      { provide: AccountingSetupRepository, useClass: DemoAccountingSetupRepository },
    ],
  });
  const auth = TestBed.inject(AuthService);
  await firstValueFrom(auth.login(email, DEMO_PASSWORD));
  return {
    repo: TestBed.inject(AccountingSetupRepository),
    store: TestBed.inject(AccountingDemoStore),
    db: TestBed.inject(DemoDatabase),
  };
}

async function errorOf(source: Observable<unknown>): Promise<DomainError> {
  const error = await firstValueFrom(source).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

function accountId(store: AccountingDemoStore, code: string): number {
  return store.accounts.find((a) => a.denominationId === 1 && a.code === code)!.id;
}

describe('DemoAccountingSetupRepository', () => {
  it('shows the funds of the tenant denomination with the opening balance of the sede', async () => {
    const { repo } = await setup(TREASURER);
    const funds = await firstValueFrom(repo.listFunds());

    expect(funds.every((f) => f.denominationId === 1)).toBe(true);
    expect(funds.find((f) => f.name === 'Fondo Local')?.openingBalance).toBe(18_450_000);
    expect(funds.find((f) => f.name === 'Fondo Local')?.openingLocked).toBe(true);
  });

  it('isolates another denomination', async () => {
    const { repo } = await setup(OTHER_DENOMINATION_ADMIN);
    const funds = await firstValueFrom(repo.listFunds());
    const accounts = await firstValueFrom(repo.listAccounts());

    expect(funds.map((f) => f.name)).toEqual(['Fondo General']);
    expect(accounts.every((a) => a.denominationId === 2)).toBe(true);
    expect((await errorOf(repo.saveFund({ id: null, name: 'Fondo Nuevo', isActive: true, openingBalance: null }))).code).toBe('FORBIDDEN');
  });

  it('rejects writes without budgets.manage', async () => {
    const { repo } = await setup(PASTOR);
    const error = await errorOf(repo.saveFund({ id: null, name: 'Fondo de Becas', isActive: true, openingBalance: 0 }));
    expect(error.code).toBe('FORBIDDEN');
  });

  it('creates a fund with its opening balance and keeps names unique per denomination', async () => {
    const { repo, db } = await setup(TREASURER);
    const fund = await firstValueFrom(repo.saveFund({ id: null, name: 'Comité de Caballeros', isActive: true, openingBalance: 350_000 }));

    expect(fund.openingBalance).toBe(350_000);
    expect(fund.openingLocked).toBe(false);
    expect(db.auditLogs.at(-1)?.action).toBe('FUND_CREATED');
    const duplicate = await errorOf(repo.saveFund({ id: null, name: 'fondo local', isActive: true, openingBalance: null }));
    expect(duplicate.code).toBe('FUND_NAME_TAKEN');
  });

  it('locks the opening balance once the fund has movements and refuses to delete a used fund', async () => {
    const { repo } = await setup(TREASURER);
    const locked = await errorOf(repo.saveFund({ id: 1, name: 'Fondo Local', isActive: true, openingBalance: 1 }));
    expect(locked.code).toBe('OPENING_BALANCE_LOCKED');
    expect((await errorOf(repo.deleteFund(1))).code).toBe('FUND_IN_USE');
  });

  it('refuses to deactivate the suggested fund of active accounts', async () => {
    const { repo, store } = await setup(TREASURER);
    expect((await errorOf(repo.saveFund({ id: 1, name: 'Fondo Local', isActive: false, openingBalance: null }))).code).toBe(
      'FUND_IS_DEFAULT',
    );
    expect(store.funds.find((f) => f.id === 1)?.isActive).toBe(true);

    // A fund no account suggests can be deactivated.
    const youth = store.funds.find((f) => f.id === 5)!;
    const saved = await firstValueFrom(repo.saveFund({ id: youth.id, name: youth.name, isActive: false, openingBalance: null }));
    expect(saved.isActive).toBe(false);
  });

  it('validates account codes: unique, numeric and prefixed by the parent', async () => {
    const { repo, store } = await setup(TREASURER);
    const parentId = accountId(store, '4105');
    const base = { id: null, parentId, name: 'Ofrendas especiales', nature: 'INCOME' as const, isPostable: true, defaultFundId: 1 };

    expect((await errorOf(repo.saveAccount({ ...base, code: '410505' }))).code).toBe('ACCOUNT_CODE_TAKEN');
    expect((await errorOf(repo.saveAccount({ ...base, code: '420599' }))).code).toBe('ACCOUNT_CODE_PREFIX');
    expect((await errorOf(repo.saveAccount({ ...base, code: '41-05' }))).code).toBe('ACCOUNT_CODE_INVALID');
    expect((await errorOf(repo.saveAccount({ ...base, code: '410590', nature: 'EXPENSE' }))).code).toBe('ACCOUNT_NATURE_MISMATCH');

    const created = await firstValueFrom(repo.saveAccount({ ...base, code: '410590' }));
    expect(created.depth).toBe(2);
    expect(created.isPostable).toBe(true);
  });

  it('never lets a parent with children be postable, nor a used account become a group', async () => {
    const { repo, store } = await setup(TREASURER);
    const group = store.accounts.find((a) => a.id === accountId(store, '4105'))!;
    const tithes = store.accounts.find((a) => a.id === accountId(store, '410505'))!;

    const parentError = await errorOf(repo.saveAccount({ ...group, id: group.id, isPostable: true }));
    expect(parentError.code).toBe('ACCOUNT_HAS_CHILDREN');
    const childOfUsed = await errorOf(
      repo.saveAccount({ id: null, parentId: tithes.id, code: '41050501', name: 'Diezmos en especie', nature: 'INCOME', isPostable: true, defaultFundId: null }),
    );
    expect(childOfUsed.code).toBe('ACCOUNT_HAS_MOVEMENTS');
  });

  it('turns an unused postable account into a group when it receives a child', async () => {
    const { repo, store } = await setup(TREASURER);
    const leaf = await firstValueFrom(
      repo.saveAccount({ id: null, parentId: accountId(store, '5105'), code: '510590', name: 'Imprevistos', nature: 'EXPENSE', isPostable: true, defaultFundId: null }),
    );
    await firstValueFrom(
      repo.saveAccount({ id: null, parentId: leaf.id, code: '51059005', name: 'Imprevistos menores', nature: 'EXPENSE', isPostable: true, defaultFundId: null }),
    );

    const accounts = await firstValueFrom(repo.listAccounts());
    expect(accounts.find((a) => a.id === leaf.id)?.isPostable).toBe(false);
    expect(accounts.find((a) => a.id === leaf.id)?.hasChildren).toBe(true);
  });

  it('deletes only accounts without children, movements or contribution types', async () => {
    const { repo, store } = await setup(TREASURER);
    expect((await errorOf(repo.deleteAccount(accountId(store, '4105')))).code).toBe('ACCOUNT_HAS_CHILDREN');
    expect((await errorOf(repo.deleteAccount(accountId(store, '510505')))).code).toBe('ACCOUNT_HAS_MOVEMENTS');

    const free = await firstValueFrom(
      repo.saveAccount({ id: null, parentId: accountId(store, '5105'), code: '510595', name: 'Cuenta temporal', nature: 'EXPENSE', isPostable: true, defaultFundId: null }),
    );
    await firstValueFrom(repo.deleteAccount(free.id), { defaultValue: undefined });
    expect(store.accounts.some((a) => a.id === free.id)).toBe(false);
  });

  it('links contribution types only to postable income accounts and toggles them', async () => {
    const { repo, store } = await setup(TREASURER);
    const base = { id: null, code: 'GRACIAS', name: 'Ofrenda de acción de gracias', category: 'OFFERING' as const };

    expect((await errorOf(repo.saveContributionType({ ...base, accountId: accountId(store, '4105') }))).code).toBe('TYPE_ACCOUNT_INVALID');
    expect((await errorOf(repo.saveContributionType({ ...base, accountId: accountId(store, '510505') }))).code).toBe('TYPE_ACCOUNT_INVALID');
    expect((await errorOf(repo.saveContributionType({ ...base, code: 'DIEZMO', accountId: accountId(store, '410510') }))).code).toBe('TYPE_CODE_TAKEN');

    const created = await firstValueFrom(repo.saveContributionType({ ...base, accountId: accountId(store, '410510') }));
    expect(created.accountCode).toBe('410510');
    const inactive = await firstValueFrom(repo.setContributionTypeActive(created.id, false));
    expect(inactive.isActive).toBe(false);
  });

  it('does not change the category of a type that already has contributions', async () => {
    const { repo } = await setup(TREASURER);
    const types = await firstValueFrom(repo.listContributionTypes());
    const tithe = types.find((t) => t.code === 'DIEZMO')!;
    const error = await errorOf(repo.saveContributionType({ ...tithe, category: 'OFFERING' }));
    expect(error.code).toBe('TYPE_IN_USE');
  });
});
