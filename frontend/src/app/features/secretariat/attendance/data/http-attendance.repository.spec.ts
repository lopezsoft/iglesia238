import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DomainError } from '../../../../core/errors/domain-error';
import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { AttendanceRepository } from './attendance.repository';
import { HttpAttendanceRepository } from './http-attendance.repository';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([errorInterceptor])),
      provideHttpClientTesting(),
      { provide: AttendanceRepository, useClass: HttpAttendanceRepository },
    ],
  });
  return {
    repo: TestBed.inject(AttendanceRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('HttpAttendanceRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('loads the options of the active scope', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.options());
    const request = backend.expectOne('/api/attendance-sessions/options');
    expect(request.request.method).toBe('GET');
    const options = {
      congregations: [{ id: 10, name: 'Sede Central' }],
      meetingTypes: [{ code: 'SUNDAY_SCHOOL', name: 'Escuela Dominical' }],
      categories: [{ code: 'CHILDREN', name: 'Niños' }],
      today: '2026-11-02',
      maxHeadcount: 2000,
    };
    request.flush(options);

    expect(await result).toEqual(options);
  });

  it('lists with server paging and without the empty filters', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(
      repo.list({
        congregationId: 10,
        meetingTypeCode: 'SUNDAY_SCHOOL',
        from: null,
        to: '',
        page: 2,
        pageSize: 10,
      }),
    );
    const request = backend.expectOne((req) => req.url === '/api/attendance-sessions');

    expect(request.request.params.keys().sort()).toEqual([
      'congregationId',
      'meetingTypeCode',
      'page',
      'pageSize',
    ]);
    expect(request.request.params.get('page')).toBe('2');
    request.flush({ items: [], total: 0, page: 2, pageSize: 10 });
    expect(await result).toEqual({ items: [], total: 0, page: 2, pageSize: 10 });
  });

  it('creates a session by posting the key and the counts', async () => {
    const { repo, backend } = setup();
    const input = {
      congregationId: 10,
      meetingTypeCode: 'SUNDAY_SCHOOL',
      sessionDate: '2026-11-01',
      attendanceCounts: [{ categoryCode: 'CHILDREN', headcount: 40 }],
    };

    const result = firstValueFrom(repo.create(input));
    const request = backend.expectOne('/api/attendance-sessions');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush({ id: 1, ...input, total: 40 });
    expect((await result).id).toBe(1);
  });

  it('maps DUPLICATE_SESSION to a DomainError with its code', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(
      repo.create({
        congregationId: 10,
        meetingTypeCode: 'SUNDAY_SCHOOL',
        sessionDate: '2026-11-01',
        attendanceCounts: [],
      }),
    );
    backend
      .expectOne('/api/attendance-sessions')
      .flush(
        {
          statusCode: 409,
          code: 'DUPLICATE_SESSION',
          message: 'Ya existe una sesión de Escuela Dominical.',
        },
        { status: 409, statusText: 'Conflict' },
      );

    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('DUPLICATE_SESSION');
    expect((error as DomainError).message).toContain('Ya existe una sesión');
  });

  it('corrects the counts of a session and deletes it', async () => {
    const { repo, backend } = setup();

    const updated = firstValueFrom(repo.update(5, [{ categoryCode: 'MEN', headcount: 7 }]));
    const put = backend.expectOne('/api/attendance-sessions/5');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ attendanceCounts: [{ categoryCode: 'MEN', headcount: 7 }] });
    put.flush({ id: 5, total: 7 });
    expect((await updated).id).toBe(5);

    const removed = firstValueFrom(repo.remove(5));
    const del = backend.expectOne('/api/attendance-sessions/5');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await expect(removed).resolves.toBeUndefined();
  });

  it('finds a session by its key and answers null when there is none', async () => {
    const { repo, backend } = setup();
    const key = { congregationId: 10, meetingTypeCode: 'SUNDAY_SCHOOL', sessionDate: '2026-11-01' };

    const found = firstValueFrom(repo.find(key));
    const request = backend.expectOne((req) => req.url === '/api/attendance-sessions/lookup');
    expect(request.request.params.get('sessionDate')).toBe('2026-11-01');
    request.flush({ id: 9, ...key });
    expect((await found)?.id).toBe(9);

    const missing = firstValueFrom(repo.find(key));
    backend
      .expectOne((req) => req.url === '/api/attendance-sessions/lookup')
      .flush(
        { statusCode: 404, code: 'SESSION_NOT_FOUND', message: 'La sesión no existe.' },
        { status: 404, statusText: 'Not Found' },
      );
    expect(await missing).toBeNull();
  });

  it('does not hide other failures of the lookup', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(
      repo.find({
        congregationId: 10,
        meetingTypeCode: 'SUNDAY_SCHOOL',
        sessionDate: '2026-11-01',
      }),
    );
    backend
      .expectOne((req) => req.url === '/api/attendance-sessions/lookup')
      .flush(
        { statusCode: 403, code: 'FORBIDDEN', message: 'Sin permiso.' },
        { status: 403, statusText: 'Forbidden' },
      );

    const error = await result.catch((e: unknown) => e);
    expect((error as DomainError).code).toBe('FORBIDDEN');
  });

  it('downloads the printable sheet as a PDF blob with the filters', async () => {
    const { repo, backend } = setup();

    const file = firstValueFrom(repo.exportPdf({ congregationId: 10, from: '2026-01-01' }));
    const request = backend.expectOne((req) => req.url === '/api/attendance-sessions/report.pdf');
    expect(request.request.responseType).toBe('blob');
    expect(request.request.headers.get('Accept')).toBe('application/pdf');
    expect(request.request.params.get('congregationId')).toBe('10');
    expect(request.request.params.get('from')).toBe('2026-01-01');
    request.flush(new Blob(['%PDF-'], { type: 'application/pdf' }));

    expect((await file).type).toBe('application/pdf');
  });

  it('asks for the statistics grouped and downloads the export as a blob', async () => {
    const { repo, backend } = setup();

    const stats = firstValueFrom(
      repo.stats({ congregationId: 10, meetingTypeCode: 'SUNDAY_SCHOOL', groupBy: 'year' }),
    );
    const statsRequest = backend.expectOne((req) => req.url === '/api/attendance-sessions/stats');
    expect(statsRequest.request.params.get('groupBy')).toBe('year');
    statsRequest.flush({ groupBy: 'year', series: [] });
    expect((await stats).groupBy).toBe('year');

    const file = firstValueFrom(repo.exportCsv({ congregationId: 10, from: '2026-01-01' }));
    const exportRequest = backend.expectOne((req) => req.url === '/api/attendance-sessions/export');
    expect(exportRequest.request.responseType).toBe('blob');
    expect(exportRequest.request.params.get('from')).toBe('2026-01-01');
    exportRequest.flush(new Blob(['Fecha;Total'], { type: 'text/csv' }));
    expect((await file).type).toBe('text/csv');
  });
});
