import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SaveAccountCommand } from './accounting-setup.models';
import { AccountingSetupRepository } from './accounting-setup.repository';
import { HttpAccountingSetupRepository } from './http-accounting-setup.repository';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AccountingSetupRepository, useClass: HttpAccountingSetupRepository },
    ],
  });
  return {
    repository: TestBed.inject(AccountingSetupRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('HttpAccountingSetupRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('reads the overview and the catalogs', async () => {
    const { repository, backend } = setup();

    const overview = firstValueFrom(repository.overview());
    backend.expectOne('/api/accounting/setup/overview').flush({ year: 2026, titheRule: null, periodsCount: 0 });
    expect((await overview).periodsCount).toBe(0);

    const funds = firstValueFrom(repository.listFunds());
    backend.expectOne({ method: 'GET', url: '/api/accounting/funds' }).flush([]);
    expect(await funds).toEqual([]);

    const accounts = firstValueFrom(repository.listAccounts());
    backend.expectOne('/api/accounting/accounts').flush([]);
    await accounts;

    const types = firstValueFrom(repository.listContributionTypes());
    backend.expectOne('/api/accounting/contribution-types').flush([]);
    await types;
  });

  it('creates a fund with POST and edits it with PUT, without sending the id in the body', async () => {
    const { repository, backend } = setup();

    const created = firstValueFrom(repository.saveFund({ id: null, name: 'Misiones', isActive: true, openingBalance: 350_000 }));
    const post = backend.expectOne({ method: 'POST', url: '/api/accounting/funds' });
    expect(post.request.body).toEqual({ name: 'Misiones', isActive: true, openingBalance: 350_000 });
    post.flush({ id: 7, name: 'Misiones' });
    await created;

    const updated = firstValueFrom(repository.saveFund({ id: 7, name: 'Misiones', isActive: false, openingBalance: null }));
    const put = backend.expectOne({ method: 'PUT', url: '/api/accounting/funds/7' });
    expect(put.request.body).toEqual({ name: 'Misiones', isActive: false, openingBalance: null });
    put.flush({ id: 7 });
    await updated;

    const removed = firstValueFrom(repository.deleteFund(7), { defaultValue: undefined });
    backend.expectOne({ method: 'DELETE', url: '/api/accounting/funds/7' }).flush(null);
    await removed;
  });

  it('keeps the parent and the nature out of an account update', async () => {
    const { repository, backend } = setup();
    const command: SaveAccountCommand = {
      id: 5,
      parentId: 2,
      code: '410505',
      name: 'Diezmos',
      nature: 'INCOME',
      isPostable: true,
      defaultFundId: 1,
    };

    const saved = firstValueFrom(repository.saveAccount(command));
    const put = backend.expectOne({ method: 'PUT', url: '/api/accounting/accounts/5' });
    expect(put.request.body).toEqual({ code: '410505', name: 'Diezmos', isPostable: true, defaultFundId: 1 });
    put.flush({ id: 5 });
    await saved;

    const created = firstValueFrom(repository.saveAccount({ ...command, id: null }));
    const post = backend.expectOne({ method: 'POST', url: '/api/accounting/accounts' });
    expect(post.request.body).toEqual({
      parentId: 2,
      code: '410505',
      name: 'Diezmos',
      nature: 'INCOME',
      isPostable: true,
      defaultFundId: 1,
    });
    post.flush({ id: 6 });
    await created;
  });

  it('toggles accounts and contribution types with PATCH', async () => {
    const { repository, backend } = setup();

    const account = firstValueFrom(repository.setAccountActive(3, false));
    const patchAccount = backend.expectOne({ method: 'PATCH', url: '/api/accounting/accounts/3/active' });
    expect(patchAccount.request.body).toEqual({ isActive: false });
    patchAccount.flush({ id: 3 });
    await account;

    const type = firstValueFrom(repository.setContributionTypeActive(4, true));
    const patchType = backend.expectOne({ method: 'PATCH', url: '/api/accounting/contribution-types/4/active' });
    expect(patchType.request.body).toEqual({ isActive: true });
    patchType.flush({ id: 4 });
    await type;
  });

  it('saves contribution types without the id in the body', async () => {
    const { repository, backend } = setup();
    const type = { code: 'GRACIAS', name: 'Acción de gracias', category: 'OFFERING' as const, accountId: 9 };

    const created = firstValueFrom(repository.saveContributionType({ id: null, ...type }));
    const post = backend.expectOne({ method: 'POST', url: '/api/accounting/contribution-types' });
    expect(post.request.body).toEqual(type);
    post.flush({ id: 1 });
    await created;

    const updated = firstValueFrom(repository.saveContributionType({ id: 1, ...type }));
    backend.expectOne({ method: 'PUT', url: '/api/accounting/contribution-types/1' }).flush({ id: 1 });
    await updated;
  });

  it('lists and opens periods', async () => {
    const { repository, backend } = setup();

    const list = firstValueFrom(repository.listPeriods());
    backend.expectOne({ method: 'GET', url: '/api/accounting/periods' }).flush([]);
    expect(await list).toEqual([]);

    const opened = firstValueFrom(repository.openPeriod({ year: 2026, month: 11 }));
    const post = backend.expectOne({ method: 'POST', url: '/api/accounting/periods' });
    expect(post.request.body).toEqual({ year: 2026, month: 11 });
    post.flush({ id: 1, label: 'Noviembre 2026' });
    expect((await opened).label).toBe('Noviembre 2026');
  });

  it('manages the tithe percentages as fractions', async () => {
    const { repository, backend } = setup();

    const list = firstValueFrom(repository.listTitheRules());
    backend.expectOne({ method: 'GET', url: '/api/accounting/tithe-rules' }).flush([]);
    await list;

    const created = firstValueFrom(
      repository.saveTitheRule({ id: null, effectiveFrom: '2026-01-01', nationalShareRate: 0.21, localFundRate: 0.03 }),
    );
    const post = backend.expectOne({ method: 'POST', url: '/api/accounting/tithe-rules' });
    expect(post.request.body).toEqual({ effectiveFrom: '2026-01-01', nationalShareRate: 0.21, localFundRate: 0.03 });
    post.flush({ id: 2 });
    await created;

    const updated = firstValueFrom(
      repository.saveTitheRule({ id: 2, effectiveFrom: '2026-01-01', nationalShareRate: 0.22, localFundRate: 0.03 }),
    );
    const put = backend.expectOne({ method: 'PUT', url: '/api/accounting/tithe-rules/2' });
    expect(put.request.body).toEqual({ effectiveFrom: '2026-01-01', nationalShareRate: 0.22, localFundRate: 0.03 });
    put.flush({ id: 2 });
    await updated;

    const removed = firstValueFrom(repository.deleteTitheRule(2), { defaultValue: undefined });
    backend.expectOne({ method: 'DELETE', url: '/api/accounting/tithe-rules/2' }).flush(null);
    await removed;
  });
});
