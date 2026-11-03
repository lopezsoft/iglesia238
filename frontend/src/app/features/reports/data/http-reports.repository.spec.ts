import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DomainError } from '../../../core/errors/domain-error';
import { errorInterceptor } from '../../../core/http/error.interceptor';
import { HttpReportsRepository } from './http-reports.repository';
import { ReportsRepository } from './reports.repository';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([errorInterceptor])),
      provideHttpClientTesting(),
      { provide: ReportsRepository, useClass: HttpReportsRepository },
    ],
  });
  return { repo: TestBed.inject(ReportsRepository), backend: TestBed.inject(HttpTestingController) };
}

const QUERY = { from: '2026-10-01', to: '2026-10-31', fundId: null, congregationId: null };

describe('HttpReportsRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('reads the options of the scope', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.options());
    const request = backend.expectOne('/api/reports/options');
    expect(request.request.method).toBe('GET');
    request.flush({ scopeLabel: 'Sede Central', denominationWide: false, funds: [], congregations: [], today: '2026-11-02' });

    expect((await result).today).toBe('2026-11-02');
  });

  it('sends only the filters that are set', async () => {
    const { repo, backend } = setup();

    const plain = firstValueFrom(repo.financialReport(QUERY));
    const first = backend.expectOne((req) => req.url === '/api/reports/financial');
    expect(first.request.params.keys().sort()).toEqual(['from', 'to']);
    first.flush({ totals: {} });
    await plain;

    const filtered = firstValueFrom(repo.financialReport({ ...QUERY, fundId: 2, congregationId: 11 }));
    const second = backend.expectOne((req) => req.url === '/api/reports/financial');
    expect(Object.fromEntries(second.request.params.keys().map((key) => [key, second.request.params.get(key)]))).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
      fundId: '2',
      congregationId: '11',
    });
    second.flush({ totals: {} });
    await filtered;
  });

  it('downloads the contribution detail as a CSV blob', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.contributionDetailCsv({ ...QUERY, fundId: 1 }));
    const request = backend.expectOne((req) => req.url === '/api/reports/contributions-detail.csv');
    expect(request.request.responseType).toBe('blob');
    expect(request.request.headers.get('Accept')).toBe('text/csv');
    expect(request.request.params.get('fundId')).toBe('1');
    request.flush(new Blob(['a;b']));

    expect(await result).toBeInstanceOf(Blob);
  });

  it('keeps the code and message the API sends when the export is refused with 422', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.contributionDetailCsv(QUERY));
    backend.expectOne((req) => req.url === '/api/reports/contributions-detail.csv').flush(
      new Blob([
        JSON.stringify({
          code: 'EXPORT_TOO_LARGE',
          message: 'El rango tiene más de 50.000 aportes: acórtalo para exportarlo.',
        }),
      ]),
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    await expect(result).rejects.toMatchObject({
      code: 'EXPORT_TOO_LARGE',
      message: 'El rango tiene más de 50.000 aportes: acórtalo para exportarlo.',
    });
    await expect(result).rejects.toBeInstanceOf(DomainError);
  });

  it('keeps the other errors as the interceptor mapped them', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.contributionDetailCsv(QUERY));
    backend
      .expectOne((req) => req.url === '/api/reports/contributions-detail.csv')
      .flush(new Blob(['{}']), { status: 403, statusText: 'Forbidden' });

    await expect(result).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});
