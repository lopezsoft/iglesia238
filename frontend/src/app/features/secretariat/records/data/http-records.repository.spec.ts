import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DomainError } from '../../../../core/errors/domain-error';
import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { HttpRecordsRepository } from './http-records.repository';
import { RecordsRepository } from './records.repository';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([errorInterceptor])),
      provideHttpClientTesting(),
      { provide: RecordsRepository, useClass: HttpRecordsRepository },
    ],
  });
  return {
    repo: TestBed.inject(RecordsRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('HttpRecordsRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('loads the context and the summary', async () => {
    const { repo, backend } = setup();

    const context = firstValueFrom(repo.context());
    backend
      .expectOne('/api/secretariat/records/context')
      .flush({ today: '2026-11-02', congregations: [{ id: 10, name: 'Sede Central' }] });
    expect((await context).today).toBe('2026-11-02');

    const summary = firstValueFrom(repo.summary());
    backend
      .expectOne('/api/secretariat/records/summary')
      .flush({ year: 2026, dedicationsTotal: 3 });
    expect((await summary).year).toBe(2026);
  });

  it('searches people on the server, trimming the text and sending who the person is for', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(
      repo.searchPeople({ q: '  marta ', eligibleFor: 'spouse', limit: 8 }),
    );
    const request = backend.expectOne((req) => req.url === '/api/secretariat/people');

    expect(request.request.params.get('q')).toBe('marta');
    expect(request.request.params.get('eligibleFor')).toBe('spouse');
    expect(request.request.params.get('limit')).toBe('8');
    request.flush([{ id: 4, fullName: 'Marta Castillo', maskedDocument: 'CC ···· 4817' }]);
    expect((await result)[0].maskedDocument).toBe('CC ···· 4817');
  });

  it('lists dedications with server paging and only the filters that are set', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(
      repo.dedications({
        page: 2,
        pageSize: 10,
        q: ' ana ',
        congregationId: null,
        from: '',
        to: '2026-12-31',
      }),
    );
    const request = backend.expectOne((req) => req.url === '/api/child-dedications');

    expect(request.request.params.keys().sort()).toEqual(['page', 'pageSize', 'q', 'to']);
    expect(request.request.params.get('q')).toBe('ana');
    request.flush({ items: [], total: 0, page: 2, pageSize: 10 });
    expect((await result).page).toBe(2);
  });

  it('opens a dedication by id and creates one with the parents', async () => {
    const { repo, backend } = setup();

    const detail = firstValueFrom(repo.dedication(7));
    const get = backend.expectOne('/api/child-dedications/7');
    expect(get.request.method).toBe('GET');
    get.flush({ id: 7 });
    expect((await detail).id).toBe(7);

    const input = {
      congregationId: 10,
      childId: 4,
      dedicatedOn: '2026-10-25',
      pastorId: null,
      father: { personId: 5, name: null },
      mother: { personId: null, name: 'Gloria Muñoz' },
      guardian: null,
    };
    const created = firstValueFrom(repo.createDedication(input));
    const post = backend.expectOne('/api/child-dedications');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(input);
    post.flush({ id: 8 });
    expect((await created).id).toBe(8);
  });

  it('lists marriages by status and dissolves one', async () => {
    const { repo, backend } = setup();

    const list = firstValueFrom(repo.marriages({ page: 1, pageSize: 10, status: 'active' }));
    const request = backend.expectOne((req) => req.url === '/api/marriages');
    expect(request.request.params.get('status')).toBe('active');
    request.flush({ items: [], total: 0, page: 1, pageSize: 10 });
    await list;

    const dissolved = firstValueFrom(
      repo.dissolveMarriage(3, { endedOn: '2026-10-20', endReason: 'DEATH' }),
    );
    const post = backend.expectOne('/api/marriages/3/dissolve');
    expect(post.request.body).toEqual({ endedOn: '2026-10-20', endReason: 'DEATH' });
    post.flush({ id: 3, status: 'DISSOLVED' });
    expect((await dissolved).status).toBe('DISSOLVED');
  });

  it('maps an active marriage conflict to a DomainError with its code and Spanish message', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(
      repo.createMarriage({
        spouse1Id: 1,
        spouse2Id: 2,
        marriedOn: '2026-07-18',
        place: 'Templo',
        registeredWith: 'CHURCH',
        officiantId: null,
      }),
    );
    backend
      .expectOne('/api/marriages')
      .flush(
        {
          statusCode: 409,
          code: 'ACTIVE_MARRIAGE_EXISTS',
          message: 'Uno de los cónyuges ya tiene un matrimonio vigente.',
        },
        { status: 409, statusText: 'Conflict' },
      );

    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('ACTIVE_MARRIAGE_EXISTS');
    expect((error as DomainError).message).toContain('matrimonio vigente');
  });

  it('lists the current terms, creates a term and closes it', async () => {
    const { repo, backend } = setup();

    const terms = firstValueFrom(repo.pastoralTerms({ congregationId: 10, current: true }));
    const request = backend.expectOne((req) => req.url === '/api/pastoral-terms');
    expect(request.request.params.get('current')).toBe('true');
    expect(request.request.params.get('congregationId')).toBe('10');
    request.flush([]);
    await terms;

    const all = firstValueFrom(repo.pastoralTerms());
    const unfiltered = backend.expectOne((req) => req.url === '/api/pastoral-terms');
    expect(unfiltered.request.params.keys()).toEqual([]);
    unfiltered.flush([]);
    await all;

    const created = firstValueFrom(
      repo.createPastoralTerm({
        congregationId: 10,
        pastorId: 5,
        startedOn: '2026-11-01',
        endedOn: null,
        closeCurrent: true,
      }),
    );
    const post = backend.expectOne('/api/pastoral-terms');
    expect(post.request.body).toMatchObject({ closeCurrent: true, endedOn: null });
    post.flush({ id: 9 });
    await created;

    const closed = firstValueFrom(repo.closePastoralTerm(9, '2026-12-01'));
    const close = backend.expectOne('/api/pastoral-terms/9/close');
    expect(close.request.body).toEqual({ endedOn: '2026-12-01' });
    close.flush({ id: 9, endedOn: '2026-12-01' });
    expect((await closed).endedOn).toBe('2026-12-01');
  });
});
