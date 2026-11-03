import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { scopeInterceptor } from '../../../../core/http/scope.interceptor';
import { HttpVowsRepository } from './http-vows.repository';
import { VowsRepository } from './vows.repository';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([errorInterceptor, scopeInterceptor])),
      provideHttpClientTesting(),
      {
        provide: AuthService,
        useValue: { activeScope: () => ({ kind: 'DENOMINATION', denominationId: 1, congregationId: null, label: 'Toda la denominación' }) },
      },
      { provide: VowsRepository, useClass: HttpVowsRepository },
    ],
  });
  return { repo: TestBed.inject(VowsRepository), backend: TestBed.inject(HttpTestingController) };
}

describe('HttpVowsRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('asks for a page of pledges with the filters, the denomination scope and no empty values', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(
      repo.overview({ status: 'ACTIVE', contributionTypeId: null, search: ' ana ', overdueOnly: true, page: 3, pageSize: 10 }),
    );
    const request = backend.expectOne((req) => req.url === '/api/accounting/vow-pledges');

    expect(request.request.headers.get('X-Scope')).toBe('D:1');
    expect(request.request.params.keys().sort()).toEqual(['overdueOnly', 'page', 'pageSize', 'search', 'status']);
    expect(request.request.params.get('search')).toBe('ana');
    expect(request.request.params.get('overdueOnly')).toBe('true');
    request.flush({ today: '2026-11-02', items: [], total: 0, page: 3, pageSize: 10 });
    expect((await result).today).toBe('2026-11-02');
  });

  it('does not send the overdue flag when it is off', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.overview({ overdueOnly: false, page: 1, pageSize: 10 }));
    const request = backend.expectOne((req) => req.url === '/api/accounting/vow-pledges');

    expect(request.request.params.has('overdueOnly')).toBe(false);
    request.flush({ items: [] });
    await result;
  });

  it('reads the detail of a pledge', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.detail(14));
    backend.expectOne('/api/accounting/vow-pledges/14').flush({ id: 14, payments: [], cancelReason: null });

    expect((await result).id).toBe(14);
  });

  it('creates, edits and cancels a pledge', async () => {
    const { repo, backend } = setup();
    const create = {
      personId: 1,
      contributionTypeId: 3,
      pledgedAmount: 500000,
      pledgedOn: '2026-11-02',
      dueOn: null,
      description: null,
    };

    const created = firstValueFrom(repo.create(create));
    const post = backend.expectOne('/api/accounting/vow-pledges');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(create);
    post.flush({ id: 5, code: 'VOTO-2026-0005' });
    expect((await created).code).toBe('VOTO-2026-0005');

    const updated = firstValueFrom(repo.update(5, { dueOn: '2027-01-31' }));
    const patch = backend.expectOne('/api/accounting/vow-pledges/5');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ dueOn: '2027-01-31' });
    patch.flush({ id: 5, dueOn: '2027-01-31' });
    expect((await updated).dueOn).toBe('2027-01-31');

    const cancelled = firstValueFrom(repo.cancel(5, 'El miembro cambió de ciudad.'));
    const cancel = backend.expectOne('/api/accounting/vow-pledges/5/cancel');
    expect(cancel.request.method).toBe('POST');
    expect(cancel.request.body).toEqual({ reason: 'El miembro cambió de ciudad.' });
    cancel.flush({ id: 5, status: 'CANCELLED' });
    expect((await cancelled).status).toBe('CANCELLED');
  });

  it('turns an API conflict into a DomainError', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.cancel(5, 'Motivo suficiente.')).catch((error: unknown) => error);
    backend.expectOne('/api/accounting/vow-pledges/5/cancel').flush(
      { statusCode: 409, code: 'VOW_PLEDGE_FULFILLED', message: 'La promesa ya está cumplida: no se puede cancelar.' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(await result).toMatchObject({ code: 'VOW_PLEDGE_FULFILLED', status: 409 });
  });

  it('searches contributors with the trimmed text', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.searchPersons(' SC-0130 '));
    const request = backend.expectOne((req) => req.url === '/api/accounting/contributors/search');

    expect(request.request.params.get('q')).toBe('SC-0130');
    request.flush([]);
    expect(await result).toEqual([]);
  });

  it('exports the CSV with the same filters as the list', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.exportCsv({ status: 'FULFILLED' }));
    const request = backend.expectOne((req) => req.url === '/api/accounting/vow-pledges/export');

    expect(request.request.params.get('status')).toBe('FULFILLED');
    request.flush(new Blob(['x']), { headers: { 'Content-Disposition': 'attachment; filename="votos-2026-11-02.csv"' } });
    expect((await result).filename).toBe('votos-2026-11-02.csv');
  });
});
