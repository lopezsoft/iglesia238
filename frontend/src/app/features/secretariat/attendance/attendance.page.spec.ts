import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
import { AuthGateway, InvitationInfo } from '../../../core/auth/auth.gateway';
import { AuthService } from '../../../core/auth/auth.service';
import { Scope, SessionUser } from '../../../core/auth/session.model';
import { DomainError } from '../../../core/errors/domain-error';
import { FileDownloadService } from '../../../shared/utils/file-download.service';
import { Page } from '../../../shared/utils/pagination';
import { AttendancePage } from './attendance.page';
import {
  AttendanceCount,
  AttendanceFilter,
  AttendanceListQuery,
  AttendanceOptions,
  AttendanceSession,
  AttendanceSessionInput,
  AttendanceSessionKey,
  AttendanceStats,
  AttendanceStatsQuery,
} from './data/attendance.models';
import { AttendanceRepository } from './data/attendance.repository';

const sede: Scope = {
  kind: 'CONGREGATION',
  denominationId: 1,
  congregationId: 10,
  label: 'Sede Central',
};

const session: SessionUser = {
  id: 1,
  displayName: 'Marta Castillo',
  email: 'marta@iglesia.example',
  emailVerified: true,
  assignments: [
    { role: 'SECRETARY', roleName: 'Secretaría', permissions: ['attendance.write'], scope: sede },
  ],
  selectableScopes: [sede],
};

class FakeAuthGateway extends AuthGateway {
  login = () => of(session);
  restore = () => of<SessionUser | null>(session);
  logout = () => of(undefined);
  requestPasswordReset = () => of(undefined);
  confirmPasswordReset = () => of(undefined);
  getInvitation = (): Observable<InvitationInfo> =>
    of({ email: 'x@y.z', displayName: null, expiresAt: null });
  acceptInvitation = () => of(undefined);
  confirmEmail = () => of(undefined);
  resendEmailVerification = () => of({ devVerificationLink: null });
  changePassword = () => of(undefined);
}

const options: AttendanceOptions = {
  congregations: [{ id: 10, name: 'Sede Central' }],
  meetingTypes: [{ code: 'SUNDAY_SCHOOL', name: 'Escuela Dominical' }],
  categories: [
    { code: 'CHILDREN', name: 'Niños' },
    { code: 'MEN', name: 'Hermanos' },
  ],
  today: '2026-11-02',
  maxHeadcount: 2000,
};

function sessionOf(
  id: number,
  sessionDate: string,
  children: number,
  men: number,
): AttendanceSession {
  return {
    id,
    denominationId: 1,
    congregationId: 10,
    congregationName: 'Sede Central',
    meetingTypeCode: 'SUNDAY_SCHOOL',
    meetingTypeName: 'Escuela Dominical',
    sessionDate,
    attendanceCounts: [
      { categoryCode: 'CHILDREN', headcount: children },
      { categoryCode: 'MEN', headcount: men },
    ],
    total: children + men,
    recordedBy: 'Marta Castillo',
    recordedAt: `${sessionDate}T17:40:00.000Z`,
  };
}

const emptyStats: AttendanceStats = {
  groupBy: 'month',
  from: '2025-12-01',
  to: '2026-11-02',
  sessionCount: 0,
  series: [],
  average: 0,
  max: null,
  yearOverYear: {
    year: 2026,
    previousYear: 2025,
    average: null,
    previousAverage: null,
    changePercent: null,
  },
};

class FakeRepository extends AttendanceRepository {
  sessions: AttendanceSession[] = [
    sessionOf(1, '2026-10-25', 40, 12),
    sessionOf(2, '2026-10-18', 30, 10),
  ];
  readonly created: AttendanceSessionInput[] = [];
  readonly updated: { id: number; counts: readonly AttendanceCount[] }[] = [];
  readonly removed: number[] = [];
  readonly exported: AttendanceFilter[] = [];
  createError: DomainError | null = null;
  optionsResult: Observable<AttendanceOptions> = of(options);

  override options() {
    return this.optionsResult;
  }

  override list(query: AttendanceListQuery): Observable<Page<AttendanceSession>> {
    return of({
      items: this.sessions,
      total: this.sessions.length,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  override find(key: AttendanceSessionKey) {
    return of(this.sessions.find((item) => item.sessionDate === key.sessionDate) ?? null);
  }

  override create(input: AttendanceSessionInput) {
    if (this.createError) {
      return throwError(() => this.createError);
    }
    this.created.push(input);
    const created = sessionOf(
      99,
      input.sessionDate,
      input.attendanceCounts[0].headcount,
      input.attendanceCounts[1].headcount,
    );
    this.sessions = [created, ...this.sessions];
    return of(created);
  }

  override update(id: number, counts: readonly AttendanceCount[]) {
    this.updated.push({ id, counts });
    return of(sessionOf(id, '2026-10-25', counts[0].headcount, counts[1].headcount));
  }

  override remove(id: number) {
    this.removed.push(id);
    this.sessions = this.sessions.filter((item) => item.id !== id);
    return of(undefined);
  }

  override stats(_query: AttendanceStatsQuery) {
    return of<AttendanceStats>({
      ...emptyStats,
      sessionCount: 2,
      average: 46,
      max: { sessionDate: '2026-10-25', total: 52 },
      series: [{ period: '2026-10', sessions: 2, total: 92, average: 46, byCategory: {} }],
      yearOverYear: {
        year: 2026,
        previousYear: 2025,
        average: 46,
        previousAverage: 40,
        changePercent: 15,
      },
    });
  }

  override exportCsv(filter: AttendanceFilter) {
    this.exported.push(filter);
    return of(new Blob(['csv']));
  }

  readonly exportedPdf: AttendanceFilter[] = [];
  override exportPdf(filter: AttendanceFilter) {
    this.exportedPdf.push(filter);
    return of(new Blob(['%PDF-']));
  }
}

async function render(repository = new FakeRepository(), downloads = { save: vi.fn() }) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: FakeAuthGateway },
      { provide: AttendanceRepository, useValue: repository },
      { provide: FileDownloadService, useValue: downloads },
    ],
  });
  await firstValueFrom(TestBed.inject(AuthService).login('marta@iglesia.example', 'x'));
  const fixture = TestBed.createComponent(AttendancePage);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, repository, downloads, element: fixture.nativeElement as HTMLElement };
}

const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function type(element: HTMLElement, selector: string, value: string): void {
  const input = element.querySelector<HTMLInputElement>(selector);
  if (!input) {
    throw new Error(`Missing ${selector}`);
  }
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

async function submit(fixture: Awaited<ReturnType<typeof render>>['fixture']) {
  fixture.nativeElement
    .querySelector('app-attendance-form form')
    .dispatchEvent(new Event('submit'));
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

describe('AttendancePage', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  it('builds the form from the API options and shows the sede, KPIs, trend and history', async () => {
    const { element } = await render();

    expect(text(element.querySelector('app-attendance-form'))).toContain(
      'Sede Central · Escuela Dominical',
    );
    expect(element.querySelector<HTMLInputElement>('#att-date')?.value).toBe('2026-11-02');
    expect(element.querySelector('#att-CHILDREN')).not.toBeNull();
    expect(element.querySelector('#att-MEN')).not.toBeNull();
    expect(text(element)).toContain('Mejor sesión');
    expect(text(element.querySelector('app-attendance-history'))).toContain('25/10/2026');
    expect(text(element.querySelector('app-attendance-history'))).toContain('2 sesiones');
    expect(text(element)).toContain('+15 %');
  });

  it('does not offer a sede selector when the scope has a single sede', async () => {
    const { element } = await render();

    expect(element.querySelector('select#att-sede')).toBeNull();
    expect(element.querySelector<HTMLInputElement>('input#att-sede')?.value).toBe('Sede Central');
  });

  it('keeps Save disabled until there is at least one attendee, then records the session', async () => {
    const { fixture, element, repository } = await render();
    const save = () => element.querySelector<HTMLButtonElement>('button[type=submit]');

    expect(save()?.disabled).toBe(true);
    expect(text(element.querySelector('app-attendance-form'))).toContain(
      'Ingresa al menos un asistente.',
    );

    type(element, '#att-CHILDREN', '40');
    type(element, '#att-MEN', '12');
    fixture.detectChanges();
    expect(save()?.disabled).toBe(false);
    expect(element.querySelector('.total__value')?.textContent?.trim()).toBe('52');

    await submit(fixture);

    expect(repository.created).toEqual([
      {
        congregationId: 10,
        meetingTypeCode: 'SUNDAY_SCHOOL',
        sessionDate: '2026-11-02',
        attendanceCounts: [
          { categoryCode: 'CHILDREN', headcount: 40 },
          { categoryCode: 'MEN', headcount: 12 },
        ],
      },
    ]);
    expect(text(element)).toContain(
      'Asistencia de Escuela Dominical del 02/11/2026 guardada: 52 asistentes.',
    );
  });

  it('offers to load and correct the existing session when the API answers DUPLICATE_SESSION', async () => {
    const repository = new FakeRepository();
    repository.createError = new DomainError(
      'DUPLICATE_SESSION',
      'Ya existe una sesión de Escuela Dominical para esa fecha.',
      409,
    );
    repository.sessions = [sessionOf(7, '2026-11-02', 20, 5)];
    const { fixture, element } = await render(repository);
    type(element, '#att-CHILDREN', '3');
    fixture.detectChanges();

    await submit(fixture);
    expect(text(element)).toContain('Ya existe una sesión de Escuela Dominical para esa fecha.');
    const load = Array.from(element.querySelectorAll('button')).find((button) =>
      text(button).includes('Cargar y corregir'),
    );
    expect(load).toBeDefined();

    load?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(element.querySelector('app-attendance-form'))).toContain('Corregir sesión');
    expect(element.querySelector<HTMLInputElement>('#att-CHILDREN')?.value).toBe('20');
    expect(element.querySelector<HTMLInputElement>('#att-date')?.disabled).toBe(true);
  });

  it('corrects the counts of a session from the history', async () => {
    const { fixture, element, repository } = await render();
    const correct = Array.from(element.querySelectorAll('app-attendance-history button')).find(
      (button) => text(button).includes('Corregir'),
    ) as HTMLButtonElement;

    correct.click();
    fixture.detectChanges();
    type(element, '#att-MEN', '20');
    fixture.detectChanges();
    await submit(fixture);

    expect(repository.updated).toEqual([
      {
        id: 1,
        counts: [
          { categoryCode: 'CHILDREN', headcount: 40 },
          { categoryCode: 'MEN', headcount: 20 },
        ],
      },
    ]);
    expect(text(element)).toContain('corregida');
  });

  it('asks for confirmation before deleting a session', async () => {
    const { fixture, element, repository } = await render();
    const remove = Array.from(element.querySelectorAll('app-attendance-history button')).find(
      (button) => text(button).includes('Eliminar'),
    ) as HTMLButtonElement;

    remove.click();
    fixture.detectChanges();
    expect(repository.removed).toEqual([]);
    expect(text(element.querySelector('app-dialog'))).toContain(
      'Vas a eliminar la sesión de Escuela Dominical del 25/10/2026',
    );

    const confirm = Array.from(element.querySelectorAll('app-dialog button')).find((button) =>
      text(button).includes('Eliminar sesión'),
    ) as HTMLButtonElement;
    confirm.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(repository.removed).toEqual([1]);
    expect(text(element)).toContain('Se eliminó la sesión del 25/10/2026.');
  });

  it('downloads the CSV generated by the API with the active filters', async () => {
    const { fixture, element, repository, downloads } = await render();
    const csv = Array.from(element.querySelectorAll('app-export-actions button')).find((button) =>
      text(button).includes('CSV'),
    ) as HTMLButtonElement;

    csv.click();
    await fixture.whenStable();

    expect(repository.exported).toEqual([
      { congregationId: 10, meetingTypeCode: 'SUNDAY_SCHOOL', from: null, to: null },
    ]);
    expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), 'asistencia-sunday_school.csv');
  });

  it('downloads the attendance sheet as a PDF with the same filters, and not the CSV', async () => {
    const { fixture, element, repository, downloads } = await render();
    const pdf = Array.from(element.querySelectorAll('app-export-actions button')).find((button) =>
      text(button).includes('PDF'),
    ) as HTMLButtonElement;

    pdf.click();
    await fixture.whenStable();

    expect(repository.exportedPdf).toEqual([
      { congregationId: 10, meetingTypeCode: 'SUNDAY_SCHOOL', from: null, to: null },
    ]);
    expect(repository.exported).toEqual([]);
    expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), 'asistencia-sunday_school.pdf');
  });

  it('shows an error banner with retry when the options fail to load', async () => {
    const repository = new FakeRepository();
    repository.optionsResult = throwError(() => new DomainError('SERVER_ERROR', 'Falló'));
    const { element } = await render(repository);

    expect(text(element.querySelector('app-error-banner'))).toContain(
      'No fue posible cargar las sedes',
    );
  });
});
