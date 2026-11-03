import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DEFAULT_LIST_QUERY } from './applications.models';
import { HttpApplicationsRepository } from './http-applications.repository';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), HttpApplicationsRepository],
  });
  return {
    repository: TestBed.inject(HttpApplicationsRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('HttpApplicationsRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('asks for a page of the queue with only the filters that are set', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.list({ ...DEFAULT_LIST_QUERY, filter: 'DUPLICATE', page: 2 }));
    const request = backend.expectOne((req) => req.url === '/api/membership-applications');
    const { params } = request.request;
    expect(request.request.method).toBe('GET');
    expect(params.get('filter')).toBe('DUPLICATE');
    expect(params.get('page')).toBe('2');
    expect(params.get('pageSize')).toBe('10');
    expect(params.get('order')).toBe('desc');
    expect(params.has('q')).toBe(false);
    expect(params.has('congregationId')).toBe(false);
    expect(params.has('from')).toBe(false);
    request.flush({
      items: [],
      total: 0,
      page: 2,
      pageSize: 10,
      counts: { PENDING: 0, DUPLICATE: 0, APPROVED: 0, REJECTED: 0, ALL: 0 },
    });

    expect((await result).total).toBe(0);
  });

  it('sends the search, the sede and the dates when given', () => {
    const { repository, backend } = setup();

    void firstValueFrom(
      repository.list({
        ...DEFAULT_LIST_QUERY,
        search: ' ana pérez ',
        congregationId: 11,
        from: '2026-11-01',
        to: '2026-11-30',
        order: 'asc',
      }),
    );
    const { params } = backend.expectOne((req) => req.url === '/api/membership-applications').request;

    expect(params.get('q')).toBe('ana pérez');
    expect(params.get('congregationId')).toBe('11');
    expect(params.get('from')).toBe('2026-11-01');
    expect(params.get('to')).toBe('2026-11-30');
    expect(params.get('order')).toBe('asc');
  });

  it('reads the detail of an application', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.get(7));
    backend.expectOne('/api/membership-applications/7').flush({ id: 7, fullName: 'Ana Pérez' });

    expect((await result).id).toBe(7);
  });

  it('takes an application into review', () => {
    const { repository, backend } = setup();

    void firstValueFrom(repository.startReview(7));
    const request = backend.expectOne('/api/membership-applications/7/start-review');

    expect(request.request.method).toBe('POST');
    request.flush({ id: 7 });
  });

  it('rejects with the reason in the body', () => {
    const { repository, backend } = setup();

    void firstValueFrom(repository.reject(7, 'El documento no coincide.'));
    const request = backend.expectOne('/api/membership-applications/7/reject');

    expect(request.request.body).toEqual({ reason: 'El documento no coincide.' });
    request.flush({ id: 7 });
  });

  it('marks a duplicate with the matched person', () => {
    const { repository, backend } = setup();

    void firstValueFrom(repository.markDuplicate(7, 50));
    const request = backend.expectOne('/api/membership-applications/7/mark-duplicate');

    expect(request.request.body).toEqual({ matchedPersonId: 50 });
    request.flush({ id: 7 });
  });

  it('approves, and approves linking an existing person only when asked', async () => {
    const { repository, backend } = setup();

    const plain = firstValueFrom(repository.approve(7));
    const first = backend.expectOne('/api/membership-applications/7/approve');
    expect(first.request.body).toEqual({});
    first.flush({ applicationId: 7, memberId: 3, memberNumber: 1, memberCode: 'SC-0001' });
    expect((await plain).memberCode).toBe('SC-0001');

    void firstValueFrom(repository.approve(8, { linkToPersonId: 50 }));
    const second = backend.expectOne('/api/membership-applications/8/approve');
    expect(second.request.body).toEqual({ linkToPersonId: 50 });
    second.flush({ applicationId: 8, memberId: 4, memberNumber: 2, memberCode: 'SC-0002' });
  });
});
