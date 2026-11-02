import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { demoCommand, demoResponse } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { ATTENDANCE_CATEGORIES, MEETING_TYPES, catalogName } from '../../../../core/models/catalogs';
import { AttendanceDemoStore } from './attendance-demo-store';
import {
  AttendanceCongregation,
  AttendanceCount,
  AttendanceHistory,
  AttendanceHistoryQuery,
  AttendanceSession,
  AttendanceSessionInput,
  AttendanceSessionKey,
  MAX_HEADCOUNT,
  sessionTotal,
  todayIso,
} from './attendance.models';
import { AttendanceRepository } from './attendance.repository';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Simulates the attendance endpoints over the in-memory store, scoped by the active tenant. */
@Injectable()
export class DemoAttendanceRepository extends AttendanceRepository {
  private readonly auth = inject(AuthService);
  private readonly db = inject(DemoDatabase);
  private readonly store = inject(AttendanceDemoStore);

  congregations(): Observable<AttendanceCongregation[]> {
    return demoResponse(this.scopedCongregations().map(({ id, name }) => ({ id, name })));
  }

  history(query: AttendanceHistoryQuery): Observable<AttendanceHistory> {
    const sessions = this.visibleSessions()
      .filter(
        (session) =>
          session.congregationId === query.congregationId &&
          session.meetingTypeCode === query.meetingTypeCode,
      )
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
    return demoResponse({ sessions: sessions.slice(0, query.limit), total: sessions.length });
  }

  find(key: AttendanceSessionKey): Observable<AttendanceSession | null> {
    return demoResponse(this.visibleSessions().find((session) => sameKey(session, key)) ?? null);
  }

  create(input: AttendanceSessionInput): Observable<AttendanceSession> {
    return demoCommand(() => {
      this.assertCanWrite();
      const congregation = this.assertCongregationInScope(input.congregationId);
      assertMeetingType(input.meetingTypeCode);
      assertSessionDate(input.sessionDate);
      const attendanceCounts = normalizeCounts(input.attendanceCounts);

      if (this.store.sessions.some((session) => sameKey(session, input))) {
        throw new DomainError(
          'DUPLICATE_SESSION',
          `Ya existe una sesión de ${catalogName(MEETING_TYPES, input.meetingTypeCode)} en ${congregation.name} para esa fecha. Puedes cargarla y corregirla.`,
        );
      }

      const session: AttendanceSession = {
        id: this.store.nextId(),
        denominationId: congregation.denominationId,
        congregationId: congregation.id,
        meetingTypeCode: input.meetingTypeCode,
        sessionDate: input.sessionDate,
        attendanceCounts,
        recordedBy: this.auth.user()?.displayName ?? null,
        recordedAt: new Date().toISOString(),
      };
      this.store.sessions.push(session);
      this.audit(session, 'ATTENDANCE_RECORDED', null);
      return session;
    });
  }

  update(id: number, counts: readonly AttendanceCount[]): Observable<AttendanceSession> {
    return demoCommand(() => {
      this.assertCanWrite();
      const current = this.visibleSessions().find((session) => session.id === id);
      if (!current) {
        throw new DomainError('NOT_FOUND', 'La sesión no existe o no pertenece a tu sede.');
      }
      const updated: AttendanceSession = {
        ...current,
        attendanceCounts: normalizeCounts(counts),
        recordedBy: this.auth.user()?.displayName ?? current.recordedBy,
        recordedAt: new Date().toISOString(),
      };
      const index = this.store.sessions.findIndex((session) => session.id === id);
      this.store.sessions[index] = updated;
      this.audit(updated, 'ATTENDANCE_UPDATED', sessionTotal(current));
      return updated;
    });
  }

  /** Sedes of the active denomination, narrowed to the active sede when the scope has one. */
  private scopedCongregations() {
    const { denominationId, congregationId } = this.auth.tenant();
    if (denominationId === null) {
      return [];
    }
    return this.db.congregations.filter(
      (congregation) =>
        congregation.denominationId === denominationId &&
        congregation.isActive &&
        (congregationId === null || congregation.id === congregationId),
    );
  }

  private visibleSessions(): AttendanceSession[] {
    const sedeIds = new Set(this.scopedCongregations().map((congregation) => congregation.id));
    const { denominationId } = this.auth.tenant();
    return this.store.sessions.filter(
      (session) => session.denominationId === denominationId && sedeIds.has(session.congregationId),
    );
  }

  private assertCanWrite(): void {
    if (!this.auth.can('attendance.write')) {
      throw new DomainError('FORBIDDEN', 'No tienes permiso para registrar asistencia.');
    }
  }

  private assertCongregationInScope(congregationId: number) {
    const congregation = this.scopedCongregations().find((item) => item.id === congregationId);
    if (!congregation) {
      throw new DomainError('FORBIDDEN', 'No puedes registrar asistencia en esa sede.');
    }
    return congregation;
  }

  private audit(session: AttendanceSession, action: string, previousTotal: number | null): void {
    this.db.audit({
      userId: this.auth.user()?.id ?? null,
      denominationId: session.denominationId,
      congregationId: session.congregationId,
      entity: 'AttendanceSession',
      entityId: String(session.id),
      action,
      changes: { total: { from: previousTotal, to: sessionTotal(session) } },
    });
  }
}

function sameKey(session: AttendanceSessionKey, key: AttendanceSessionKey): boolean {
  return (
    session.congregationId === key.congregationId &&
    session.meetingTypeCode === key.meetingTypeCode &&
    session.sessionDate === key.sessionDate
  );
}

function assertMeetingType(code: string): void {
  if (!MEETING_TYPES.some((type) => type.code === code)) {
    throw new DomainError('INVALID_MEETING_TYPE', 'Selecciona un tipo de reunión válido.');
  }
}

function assertSessionDate(sessionDate: string): void {
  if (!ISO_DATE.test(sessionDate) || Number.isNaN(Date.parse(sessionDate))) {
    throw new DomainError('INVALID_DATE', 'Selecciona una fecha válida.');
  }
  if (sessionDate > todayIso()) {
    throw new DomainError('INVALID_DATE', 'No puedes registrar asistencia en una fecha futura.');
  }
}

/** One count per catalog category, each a non-negative integer, and at least one attendee. */
function normalizeCounts(counts: readonly AttendanceCount[]): AttendanceCount[] {
  const normalized = ATTENDANCE_CATEGORIES.map((category) => {
    const headcount = counts.find((count) => count.categoryCode === category.code)?.headcount ?? 0;
    if (!Number.isInteger(headcount) || headcount < 0 || headcount > MAX_HEADCOUNT) {
      throw new DomainError(
        'INVALID_HEADCOUNT',
        `Cada categoría admite un número entero entre 0 y ${MAX_HEADCOUNT}.`,
      );
    }
    return { categoryCode: category.code, headcount };
  });
  if (sessionTotal({ attendanceCounts: normalized }) === 0) {
    throw new DomainError('EMPTY_SESSION', 'Ingresa al menos un asistente.');
  }
  return normalized;
}
