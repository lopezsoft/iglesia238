import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../../core/auth/demo-auth.gateway';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DomainError } from '../../../../core/errors/domain-error';
import { ATTENDANCE_CATEGORIES } from '../../../../core/models/catalogs';
import { AttendanceCount, AttendanceSessionInput, sessionTotal, todayIso } from './attendance.models';
import { AttendanceRepository } from './attendance.repository';
import { DemoAttendanceRepository } from './demo-attendance.repository';

const SECRETARY_CENTRAL = 'marta.castillo@montedesion.example';
const SECRETARY_NORTE = 'paola.ruiz@montedesion.example';
const TREASURER_CENTRAL = 'jorge.ramirez@montedesion.example';
const ADMIN_DENOMINATION_2 = 'ricardo.leon@vidanueva.example';

function counts(...headcounts: number[]): AttendanceCount[] {
  return ATTENDANCE_CATEGORIES.map((category, index) => ({
    categoryCode: category.code,
    headcount: headcounts[index] ?? 0,
  }));
}

function sessionInput(overrides: Partial<AttendanceSessionInput> = {}): AttendanceSessionInput {
  return {
    congregationId: 1,
    meetingTypeCode: 'SUNDAY_SCHOOL',
    sessionDate: '2026-08-16',
    attendanceCounts: counts(40, 20, 50, 40, 5),
    ...overrides,
  };
}

async function signIn(email: string): Promise<{ repository: AttendanceRepository; auth: AuthService }> {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: DemoAuthGateway },
      { provide: AttendanceRepository, useClass: DemoAttendanceRepository },
    ],
  });
  const auth = TestBed.inject(AuthService);
  await firstValueFrom(auth.login(email, DEMO_PASSWORD));
  return { repository: TestBed.inject(AttendanceRepository), auth };
}

async function failure(promise: Promise<unknown>): Promise<DomainError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

describe('DemoAttendanceRepository', () => {
  it('records a session with its total and writes an audit entry without personal data', async () => {
    const { repository } = await signIn(SECRETARY_CENTRAL);

    const session = await firstValueFrom(repository.create(sessionInput()));

    expect(sessionTotal(session)).toBe(155);
    expect(session.recordedBy).toBe('Marta Castillo');
    const audit = TestBed.inject(DemoDatabase).auditLogs.at(-1);
    expect(audit?.action).toBe('ATTENDANCE_RECORDED');
    expect(audit?.changes).toEqual({ total: { from: null, to: 155 } });
  });

  it('rejects a second session for the same sede, meeting type and date, and lets the existing one be corrected', async () => {
    const { repository } = await signIn(SECRETARY_CENTRAL);
    const duplicate = sessionInput({ sessionDate: '2026-10-25' });

    const error = await failure(firstValueFrom(repository.create(duplicate)));
    expect(error.code).toBe('DUPLICATE_SESSION');

    const existing = await firstValueFrom(repository.find(duplicate));
    expect(existing).not.toBeNull();
    const updated = await firstValueFrom(repository.update(existing!.id, counts(1, 1, 1, 1, 1)));
    expect(updated.id).toBe(existing!.id);
    expect(sessionTotal(updated)).toBe(5);

    const history = await firstValueFrom(
      repository.history({ congregationId: 1, meetingTypeCode: 'SUNDAY_SCHOOL', limit: 50 }),
    );
    expect(history.sessions.filter((s) => s.sessionDate === '2026-10-25')).toHaveLength(1);
  });

  it('allows the same date in another sede', async () => {
    const { repository } = await signIn(SECRETARY_NORTE);
    const sedes = await firstValueFrom(repository.congregations());
    expect(sedes.map((sede) => sede.id)).toEqual([2]);

    const session = await firstValueFrom(repository.create(sessionInput({ congregationId: 2 })));
    expect(session.congregationId).toBe(2);
  });

  it('validates headcounts, empty sessions and future dates', async () => {
    const { repository } = await signIn(SECRETARY_CENTRAL);

    expect((await failure(firstValueFrom(repository.create(sessionInput({ attendanceCounts: counts(-1) }))))).code).toBe(
      'INVALID_HEADCOUNT',
    );
    expect((await failure(firstValueFrom(repository.create(sessionInput({ attendanceCounts: counts(2.5) }))))).code).toBe(
      'INVALID_HEADCOUNT',
    );
    expect((await failure(firstValueFrom(repository.create(sessionInput({ attendanceCounts: counts() }))))).code).toBe(
      'EMPTY_SESSION',
    );
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect((await failure(firstValueFrom(repository.create(sessionInput({ sessionDate: todayIso(tomorrow) }))))).code).toBe(
      'INVALID_DATE',
    );
  });

  it('only shows and accepts sessions of the active sede', async () => {
    const { repository } = await signIn(SECRETARY_NORTE);

    const central = await firstValueFrom(
      repository.history({ congregationId: 1, meetingTypeCode: 'SUNDAY_SCHOOL', limit: 50 }),
    );
    expect(central.total).toBe(0);
    expect(await firstValueFrom(repository.find(sessionInput({ sessionDate: '2026-10-25' })))).toBeNull();

    const error = await failure(firstValueFrom(repository.create(sessionInput())));
    expect(error.code).toBe('FORBIDDEN');
    // Session 1 belongs to Sede Central.
    expect((await failure(firstValueFrom(repository.update(1, counts(1))))).code).toBe('NOT_FOUND');
  });

  it('isolates denominations', async () => {
    const { repository, auth } = await signIn(ADMIN_DENOMINATION_2);
    expect(auth.tenant()).toEqual({ denominationId: 2, congregationId: null });

    const sedes = await firstValueFrom(repository.congregations());
    expect(sedes.map((sede) => sede.id)).toEqual([4, 5]);
    const central = await firstValueFrom(
      repository.history({ congregationId: 1, meetingTypeCode: 'SUNDAY_SCHOOL', limit: 50 }),
    );
    expect(central.sessions).toEqual([]);
    const own = await firstValueFrom(
      repository.history({ congregationId: 4, meetingTypeCode: 'SUNDAY_SCHOOL', limit: 50 }),
    );
    expect(own.sessions.every((session) => session.denominationId === 2)).toBe(true);
    expect(own.total).toBe(2);
  });

  it('returns the last sessions first, limited, with the full count', async () => {
    const { repository } = await signIn(SECRETARY_CENTRAL);

    const history = await firstValueFrom(
      repository.history({ congregationId: 1, meetingTypeCode: 'SUNDAY_SCHOOL', limit: 8 }),
    );
    expect(history.total).toBe(10);
    expect(history.sessions).toHaveLength(8);
    expect(history.sessions[0].sessionDate).toBe('2026-10-25');
  });

  it('rejects writes from a role without attendance.write', async () => {
    const { repository } = await signIn(TREASURER_CENTRAL);

    const error = await failure(firstValueFrom(repository.create(sessionInput())));
    expect(error.code).toBe('FORBIDDEN');
  });
});
