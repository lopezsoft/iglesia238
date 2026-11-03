import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HttpTitheSettlementsRepository } from './http-tithe-settlements.repository';
import { TitheSettlementRow } from './tithe-settlements.models';
import { TitheSettlementsRepository } from './tithe-settlements.repository';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: TitheSettlementsRepository, useClass: HttpTitheSettlementsRepository },
    ],
  });
  return {
    repo: TestBed.inject(TitheSettlementsRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

const ROW: TitheSettlementRow = {
  id: 7,
  number: 'LD-2026-00007',
  coveredFrom: '2026-10-01',
  coveredTo: '2026-10-31',
  settledOn: '2026-11-02',
  grossTithe: 3_230_000,
  nationalShare: 323_000,
  localFundShare: 872_100,
  pastorNet: 2_034_900,
  nationalShareRate: 0.1,
  localFundRate: 0.3,
  contributionCount: 9,
  status: 'ISSUED',
  voidReason: null,
  voidedAt: null,
};

describe('HttpTitheSettlementsRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('reads the overview of the active scope', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.overview());
    const request = backend.expectOne('/api/accounting/tithe-settlements/overview');
    expect(request.request.method).toBe('GET');
    request.flush({ today: '2026-11-02', congregationScoped: true, congregationName: 'Sede Central', rule: null, lastIssued: null, yearSummary: null });

    expect((await result).congregationName).toBe('Sede Central');
  });

  it('previews a range sending only its dates', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.preview({ from: '2026-10-01', to: '2026-10-31' }));
    const request = backend.expectOne((req) => req.url === '/api/accounting/tithe-settlements/preview');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('from')).toBe('2026-10-01');
    expect(request.request.params.get('to')).toBe('2026-10-31');
    request.flush({ count: 9, grossTithe: 3_230_000 });

    expect((await result).grossTithe).toBe(3_230_000);
  });

  it('confirms with the range only: the server computes the amounts', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.confirm({ from: '2026-10-01', to: '2026-10-31' }));
    const request = backend.expectOne('/api/accounting/tithe-settlements');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    request.flush(ROW);

    expect((await result).number).toBe('LD-2026-00007');
  });

  it('voids with the reason in the body', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.void(7, 'Se omitieron transferencias'));
    const request = backend.expectOne('/api/accounting/tithe-settlements/7/void');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reason: 'Se omitieron transferencias' });
    request.flush({ ...ROW, status: 'VOIDED' });

    expect((await result).status).toBe('VOIDED');
  });

  it('lists the history with server pagination and only the filters that are set', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.list({ status: null, from: null, to: null, page: 1, pageSize: 10 }));
    const request = backend.expectOne((req) => req.url === '/api/accounting/tithe-settlements');
    expect(request.request.params.keys().sort()).toEqual(['page', 'pageSize']);
    request.flush({ items: [ROW], total: 1, page: 1, pageSize: 10 });
    expect((await result).total).toBe(1);

    const filtered = firstValueFrom(repo.list({ status: 'VOIDED', from: '2026-01-01', to: '2026-12-31', page: 2, pageSize: 10 }));
    const second = backend.expectOne((req) => req.url === '/api/accounting/tithe-settlements');
    expect(Object.fromEntries(second.request.params.keys().map((key) => [key, second.request.params.get(key)]))).toEqual({
      status: 'VOIDED',
      from: '2026-01-01',
      to: '2026-12-31',
      page: '2',
      pageSize: '10',
    });
    second.flush({ items: [], total: 0, page: 2, pageSize: 10 });
    await filtered;
  });

  it('reads the detail of a settlement', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.detail(7));
    const request = backend.expectOne('/api/accounting/tithe-settlements/7');
    expect(request.request.method).toBe('GET');
    request.flush({ ...ROW, congregationName: 'Sede Central', voidedByName: null, contributions: [], cashLines: [] });

    expect((await result).congregationName).toBe('Sede Central');
  });
});
