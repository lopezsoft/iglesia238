import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DenominationSummary } from './denominations.models';
import { DenominationsRepository } from './denominations.repository';
import { HttpDenominationsRepository } from './http-denominations.repository';

const SUMMARY: DenominationSummary = {
  id: 3,
  name: 'Iglesia Cristiana Monte de Sión',
  isActive: true,
  createdAt: '2026-11-02T15:00:00.000Z',
  legalEntityCount: 1,
  congregationCount: 2,
};

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: DenominationsRepository, useClass: HttpDenominationsRepository },
    ],
  });
  return {
    repository: TestBed.inject(DenominationsRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('HttpDenominationsRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists with the server pagination and leaves out the empty filters', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(
      repository.list({ search: '  ', status: 'all', page: 2, pageSize: 10 }),
    );
    const request = backend.expectOne((req) => req.url === '/api/platform/denominations');

    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().sort()).toEqual(['page', 'pageSize']);
    expect(request.request.params.get('page')).toBe('2');
    request.flush({ items: [SUMMARY], total: 11, page: 2, pageSize: 10 });
    expect((await result).items).toEqual([SUMMARY]);
  });

  it('sends the search text and the status when they are set', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(
      repository.list({ search: ' sión ', status: 'inactive', page: 1, pageSize: 10 }),
    );
    const request = backend.expectOne((req) => req.url === '/api/platform/denominations');

    expect(request.request.params.get('search')).toBe('sión');
    expect(request.request.params.get('status')).toBe('inactive');
    request.flush({ items: [], total: 0, page: 1, pageSize: 10 });
    await result;
  });

  it('reads the stats', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.stats());
    backend.expectOne('/api/platform/denominations/stats').flush({ total: 2, active: 1, congregations: 5 });

    expect(await result).toEqual({ total: 2, active: 1, congregations: 5 });
  });

  it('creates, renames and changes the status with the contract bodies', async () => {
    const { repository, backend } = setup();

    const created = firstValueFrom(repository.create({ name: 'Nueva' }));
    const create = backend.expectOne('/api/platform/denominations');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ name: 'Nueva' });
    create.flush(SUMMARY);
    await created;

    const renamed = firstValueFrom(repository.rename(3, { name: 'Otra' }));
    const rename = backend.expectOne('/api/platform/denominations/3');
    expect(rename.request.method).toBe('PATCH');
    expect(rename.request.body).toEqual({ name: 'Otra' });
    rename.flush(SUMMARY);
    await renamed;

    const toggled = firstValueFrom(repository.setActive(3, false));
    const status = backend.expectOne('/api/platform/denominations/3/status');
    expect(status.request.method).toBe('PATCH');
    expect(status.request.body).toEqual({ isActive: false });
    status.flush({ ...SUMMARY, isActive: false });
    expect((await toggled).isActive).toBe(false);
  });
});
