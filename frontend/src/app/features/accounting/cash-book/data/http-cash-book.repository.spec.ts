import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CashBookRepository } from './cash-book.repository';
import { HttpCashBookRepository } from './http-cash-book.repository';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: CashBookRepository, useClass: HttpCashBookRepository },
    ],
  });
  return {
    repository: TestBed.inject(CashBookRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('HttpCashBookRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('reads the catalogs of the book', async () => {
    const { repository, backend } = setup();

    const options = firstValueFrom(repository.options());
    backend.expectOne('/api/accounting/cash-book/options').flush({ congregationId: 10, funds: [], periods: [], accounts: [] });

    expect((await options).congregationId).toBe(10);
  });

  it('asks for a page of the book and leaves out the filters that are not set', async () => {
    const { repository, backend } = setup();

    const view = firstValueFrom(repository.view({ fundId: 1, periodId: 11, page: 2, pageSize: 15, search: '  agua ' }));
    const request = backend.expectOne((req) => req.url === '/api/accounting/cash-book');
    expect(request.request.params.get('fundId')).toBe('1');
    expect(request.request.params.get('periodId')).toBe('11');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('15');
    expect(request.request.params.get('search')).toBe('agua');
    expect(request.request.params.has('direction')).toBe(false);
    expect(request.request.params.has('accountId')).toBe(false);
    request.flush({ rows: [], totalRows: 0, page: 2, pageSize: 15 });

    expect((await view).totalRows).toBe(0);
  });

  it('posts a movement and reverses a line by its id', async () => {
    const { repository, backend } = setup();

    const recorded = firstValueFrom(
      repository.record({ fundId: 1, direction: 'OUT', accountId: 4, postedOn: '2026-11-02', amount: 100, description: 'Pago' }),
    );
    const post = backend.expectOne({ method: 'POST', url: '/api/accounting/cash-book/transactions' });
    expect(post.request.body).toMatchObject({ fundId: 1, direction: 'OUT', accountId: 4 });
    post.flush({ transactionId: 9, voucherCode: 'CE-2026-00001', direction: 'OUT', amount: 100 });
    expect((await recorded).voucherCode).toBe('CE-2026-00001');

    const reversed = firstValueFrom(repository.reverse({ transactionId: 9, postedOn: '2026-11-02', reason: 'Factura repetida' }));
    const reverse = backend.expectOne({ method: 'POST', url: '/api/accounting/cash-book/transactions/9/reverse' });
    expect(reverse.request.body).toEqual({ postedOn: '2026-11-02', reason: 'Factura repetida' });
    reverse.flush({ transactionId: 10, voucherCode: 'CI-2026-00001', direction: 'IN', amount: 100 });
    await reversed;
  });

  it('closes a period, previews and runs a consolidation', async () => {
    const { repository, backend } = setup();

    const closed = firstValueFrom(repository.closePeriod(5));
    backend.expectOne({ method: 'POST', url: '/api/accounting/periods/5/close' }).flush({ id: 5, status: 'CLOSED' });
    expect((await closed).status).toBe('CLOSED');

    const preview = firstValueFrom(repository.consolidationPreview('2026-11-02'));
    const get = backend.expectOne((req) => req.url === '/api/accounting/cash-book/consolidation-preview');
    expect(get.request.params.get('date')).toBe('2026-11-02');
    get.flush({ date: '2026-11-02', groups: [], count: 0, total: 0, nextVoucherCode: 'CI-2026-00001' });
    await preview;

    const consolidated = firstValueFrom(repository.consolidate('2026-11-02'));
    const post = backend.expectOne({ method: 'POST', url: '/api/accounting/cash-book/consolidations' });
    expect(post.request.body).toEqual({ date: '2026-11-02' });
    post.flush({ voucherCode: 'CI-2026-00001', movements: 2, count: 5, total: 900 });
    expect((await consolidated).movements).toBe(2);
  });

  it('lists and reads vouchers', async () => {
    const { repository, backend } = setup();

    const list = firstValueFrom(repository.vouchers({ page: 1, pageSize: 15, type: 'CE', from: '2026-11-01', number: 12 }));
    const request = backend.expectOne((req) => req.url === '/api/accounting/vouchers');
    expect(request.request.params.get('type')).toBe('CE');
    expect(request.request.params.get('from')).toBe('2026-11-01');
    expect(request.request.params.get('number')).toBe('12');
    expect(request.request.params.has('status')).toBe(false);
    request.flush({ items: [], total: 0, page: 1, pageSize: 15 });
    expect((await list).total).toBe(0);

    const detail = firstValueFrom(repository.voucher(3));
    backend.expectOne('/api/accounting/vouchers/3').flush({ id: 3, code: 'CE-2026-00003', lines: [], contributionRows: [] });
    expect((await detail).code).toBe('CE-2026-00003');
  });

  it('downloads a voucher as a PDF Blob', async () => {
    const { repository, backend } = setup();

    const pdf = firstValueFrom(repository.voucherPdf(3));
    const request = backend.expectOne('/api/accounting/vouchers/3/pdf');
    expect(request.request.responseType).toBe('blob');
    expect(request.request.headers.get('Accept')).toBe('application/pdf');
    request.flush(new Blob(['%PDF-']));

    expect(await pdf).toBeInstanceOf(Blob);
  });
});
