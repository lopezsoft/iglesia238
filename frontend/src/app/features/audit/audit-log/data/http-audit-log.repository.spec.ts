import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HttpAuditLogRepository } from './http-audit-log.repository';
import { AuditLogRepository } from './audit-log.repository';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuditLogRepository, useClass: HttpAuditLogRepository },
    ],
  });
  return {
    repository: TestBed.inject(AuditLogRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

const EMPTY_PAGE = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  summary: { total: 0, roleChanges: 0, contributionVoids: 0, periodClosures: 0 },
};

describe('HttpAuditLogRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('sends only the page when there are no filters', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(
      repository.list({ from: null, to: null, userId: null, action: null, entity: null, page: 1, pageSize: 20 }),
    );
    const request = backend.expectOne((req) => req.url === '/api/audit-logs');

    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().sort()).toEqual(['page', 'pageSize']);
    request.flush(EMPTY_PAGE);
    expect((await result).summary.total).toBe(0);
  });

  it('sends every filter that is set', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(
      repository.list({
        from: '2026-11-01',
        to: '2026-11-30',
        userId: 5,
        action: 'ROLE_GRANTED',
        entity: 'UserRole',
        page: 3,
        pageSize: 20,
      }),
    );
    const request = backend.expectOne((req) => req.url === '/api/audit-logs');

    expect(request.request.params.get('from')).toBe('2026-11-01');
    expect(request.request.params.get('to')).toBe('2026-11-30');
    expect(request.request.params.get('userId')).toBe('5');
    expect(request.request.params.get('action')).toBe('ROLE_GRANTED');
    expect(request.request.params.get('entity')).toBe('UserRole');
    expect(request.request.params.get('page')).toBe('3');
    request.flush({ ...EMPTY_PAGE, page: 3 });
    expect((await result).page).toBe(3);
  });

  it('reads the options of the filters', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.filterOptions());
    backend
      .expectOne('/api/audit-logs/filter-options')
      .flush({ users: [{ id: 1, name: 'Ana' }], actions: ['CREATE'], entities: ['Congregation'] });

    expect((await result).actions).toEqual(['CREATE']);
  });
});
