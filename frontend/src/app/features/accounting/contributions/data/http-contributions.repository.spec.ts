import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DomainError } from '../../../../core/errors/domain-error';
import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { scopeInterceptor } from '../../../../core/http/scope.interceptor';
import { ContributionsRepository } from './contributions.repository';
import { HttpContributionsRepository } from './http-contributions.repository';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([errorInterceptor, scopeInterceptor])),
      provideHttpClientTesting(),
      {
        provide: AuthService,
        useValue: {
          activeScope: () => ({ kind: 'CONGREGATION', denominationId: 1, congregationId: 10, label: 'Sede Central' }),
        },
      },
      { provide: ContributionsRepository, useClass: HttpContributionsRepository },
    ],
  });
  return {
    repo: TestBed.inject(ContributionsRepository),
    backend: TestBed.inject(HttpTestingController),
    http: TestBed.inject(HttpClient),
  };
}

const listing = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 15,
  from: '2026-11-01',
  to: '2026-11-30',
  label: 'Noviembre 2026',
  periodStatus: 'OPEN',
  summary: [],
  totalAmount: 0,
  voidedCount: 0,
};

describe('HttpContributionsRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists a month with the server-side filters and the scope header, without the empty ones', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(
      repo.list({
        year: 2026,
        month: 11,
        category: 'TITHE',
        contributionTypeId: null,
        paymentMethod: null,
        status: 'VOIDED',
        search: '  REC-2026-00012 ',
        page: 2,
        pageSize: 15,
      }),
    );
    const request = backend.expectOne((req) => req.url === '/api/accounting/contributions');

    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('X-Scope')).toBe('C:10');
    expect(request.request.params.keys().sort()).toEqual([
      'category',
      'month',
      'page',
      'pageSize',
      'search',
      'status',
      'year',
    ]);
    expect(request.request.params.get('search')).toBe('REC-2026-00012');
    expect(request.request.params.get('page')).toBe('2');
    request.flush(listing);
    expect((await result).label).toBe('Noviembre 2026');
  });

  it('lists a date range instead of a month', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.list({ from: '2026-10-01', to: '2026-11-15', page: 1, pageSize: 15 }));
    const request = backend.expectOne((req) => req.url === '/api/accounting/contributions');

    expect(request.request.params.get('from')).toBe('2026-10-01');
    expect(request.request.params.get('to')).toBe('2026-11-15');
    expect(request.request.params.has('month')).toBe(false);
    request.flush(listing);
    await result;
  });

  it('reads the form options and the detail of a contribution', async () => {
    const { repo, backend } = setup();

    const options = firstValueFrom(repo.formOptions());
    backend.expectOne('/api/accounting/contributions/form-options').flush({ today: '2026-11-02' });
    expect((await options).today).toBe('2026-11-02');

    const detail = firstValueFrom(repo.detail(41));
    backend.expectOne('/api/accounting/contributions/41').flush({ id: 41, recordedByName: 'Tesorera' });
    expect((await detail).recordedByName).toBe('Tesorera');
  });

  it('records a contribution with a POST and returns the row with its receipt', async () => {
    const { repo, backend } = setup();
    const command = {
      contributionTypeId: 1,
      personId: 5,
      receivedOn: '2026-11-02',
      amount: 250000,
      paymentMethod: 'CASH' as const,
      paymentReference: null,
      vowPledgeId: null,
      notes: null,
    };

    const result = firstValueFrom(repo.record(command));
    const request = backend.expectOne('/api/accounting/contributions');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(command);
    request.flush({ id: 9, receiptNumber: 'REC-2026-00001' });
    expect((await result).receiptNumber).toBe('REC-2026-00001');
  });

  it('voids with the reason in the body', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.void(9, 'Valor digitado con error.'));
    const request = backend.expectOne('/api/accounting/contributions/9/void');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reason: 'Valor digitado con error.' });
    request.flush({ id: 9, status: 'VOIDED' });
    expect((await result).status).toBe('VOIDED');
  });

  it('maps an API failure to a DomainError with the code and the Spanish message', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.void(9, 'Valor digitado con error.')).catch((error: unknown) => error);
    backend.expectOne('/api/accounting/contributions/9/void').flush(
      { statusCode: 409, code: 'CONTRIBUTION_SETTLED', message: 'Un aporte liquidado no se puede anular.' },
      { status: 409, statusText: 'Conflict' },
    );

    const error = (await result) as DomainError;
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code: 'CONTRIBUTION_SETTLED', status: 409 });
    expect(error.message).toBe('Un aporte liquidado no se puede anular.');
  });

  it('searches contributors, open pledges and the payment target', async () => {
    const { repo, backend } = setup();

    const people = firstValueFrom(repo.searchPersons(' Ana '));
    const search = backend.expectOne((req) => req.url === '/api/accounting/contributors/search');
    expect(search.request.params.get('q')).toBe('Ana');
    search.flush([{ id: 1, fullName: 'Ana Pérez', memberCode: 'SC-0130', congregationName: 'Sede Central', documentHint: 'CC ···1904' }]);
    expect((await people)[0].documentHint).toBe('CC ···1904');

    const open = firstValueFrom(repo.openPledges(1, 3));
    const openRequest = backend.expectOne((req) => req.url === '/api/accounting/vow-pledges/open');
    expect(openRequest.request.params.get('personId')).toBe('1');
    expect(openRequest.request.params.get('contributionTypeId')).toBe('3');
    openRequest.flush([]);
    expect(await open).toEqual([]);

    const target = firstValueFrom(repo.vowPaymentTarget(7));
    backend.expectOne('/api/accounting/vow-pledges/7/payment-target').flush({ pledge: { id: 7 }, person: { id: 1 } });
    expect((await target).pledge.id).toBe(7);
  });

  it('downloads the CSV of the filter with the file name the API proposes', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.exportCsv({ year: 2026, month: 11, category: 'OFFERING' }));
    const request = backend.expectOne((req) => req.url === '/api/accounting/contributions/export');

    expect(request.request.responseType).toBe('blob');
    expect(request.request.params.get('category')).toBe('OFFERING');
    expect(request.request.params.has('page')).toBe(false);
    request.flush(new Blob(['a;b']), {
      headers: { 'Content-Disposition': 'attachment; filename="aportes-2026-11-01_2026-11-30.csv"' },
    });

    const file = await result;
    expect(file.filename).toBe('aportes-2026-11-01_2026-11-30.csv');
    expect(file.blob.size).toBe(3);
  });

  it('downloads the receipt of a contribution as a PDF Blob through its voucher', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.receiptPdf(14));
    const request = backend.expectOne('/api/accounting/vouchers/14/pdf');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['%PDF-']));

    expect(await result).toBeInstanceOf(Blob);
  });

  it('falls back to a default file name when the API sends none', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.exportCsv({}));
    backend.expectOne((req) => req.url === '/api/accounting/contributions/export').flush(new Blob(['x']));

    expect((await result).filename).toBe('aportes.csv');
  });
});
