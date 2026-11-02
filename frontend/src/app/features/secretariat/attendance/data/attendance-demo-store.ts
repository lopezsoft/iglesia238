import { Injectable } from '@angular/core';
import { ATTENDANCE_CATEGORIES } from '../../../../core/models/catalogs';
import { AttendanceSession } from './attendance.models';

/** Children, teenagers, women, men and visitors, in ATTENDANCE_CATEGORIES order. */
type Headcounts = readonly [number, number, number, number, number];

interface SessionSeed {
  readonly denominationId: number;
  readonly congregationId: number;
  readonly sessionDate: string;
  readonly headcounts: Headcounts;
  readonly recordedBy: string | null;
}

// Fictional Sunday school headcounts. Sede Central has ten Sundays; the other sedes a few,
// and a sede of denomination 2 proves tenant isolation.
const SEEDS: readonly SessionSeed[] = [
  central('2026-08-23', [37, 22, 51, 40, 5]),
  central('2026-08-30', [40, 24, 55, 42, 9]),
  central('2026-09-06', [38, 24, 52, 41, 6]),
  central('2026-09-13', [41, 22, 55, 43, 9]),
  central('2026-09-20', [36, 25, 50, 39, 4]),
  central('2026-09-27', [44, 27, 58, 45, 11]),
  central('2026-10-04', [40, 23, 54, 42, 7]),
  central('2026-10-11', [42, 26, 57, 44, 12]),
  central('2026-10-18', [39, 21, 53, 40, 5]),
  central('2026-10-25', [45, 28, 60, 46, 8]),
  { denominationId: 1, congregationId: 2, sessionDate: '2026-10-04', headcounts: [18, 11, 26, 19, 3], recordedBy: 'Paola Ruiz' },
  { denominationId: 1, congregationId: 2, sessionDate: '2026-10-11', headcounts: [20, 12, 27, 21, 5], recordedBy: 'Paola Ruiz' },
  { denominationId: 1, congregationId: 2, sessionDate: '2026-10-18', headcounts: [17, 10, 25, 18, 2], recordedBy: 'Paola Ruiz' },
  { denominationId: 1, congregationId: 2, sessionDate: '2026-10-25', headcounts: [21, 13, 28, 20, 6], recordedBy: 'Paola Ruiz' },
  { denominationId: 1, congregationId: 3, sessionDate: '2026-10-11', headcounts: [12, 6, 17, 11, 2], recordedBy: null },
  { denominationId: 1, congregationId: 3, sessionDate: '2026-10-18', headcounts: [11, 7, 16, 12, 1], recordedBy: null },
  { denominationId: 1, congregationId: 3, sessionDate: '2026-10-25', headcounts: [13, 8, 18, 12, 3], recordedBy: null },
  { denominationId: 2, congregationId: 4, sessionDate: '2026-10-18', headcounts: [9, 5, 14, 10, 2], recordedBy: 'Ricardo León' },
  { denominationId: 2, congregationId: 4, sessionDate: '2026-10-25', headcounts: [10, 6, 15, 9, 1], recordedBy: 'Ricardo León' },
];

function central(sessionDate: string, headcounts: Headcounts): SessionSeed {
  return { denominationId: 1, congregationId: 1, sessionDate, headcounts, recordedBy: 'Marta Castillo' };
}

function toSession(seed: SessionSeed, index: number): AttendanceSession {
  return {
    id: index + 1,
    denominationId: seed.denominationId,
    congregationId: seed.congregationId,
    meetingTypeCode: 'SUNDAY_SCHOOL',
    sessionDate: seed.sessionDate,
    attendanceCounts: ATTENDANCE_CATEGORIES.map((category, position) => ({
      categoryCode: category.code,
      headcount: seed.headcounts[position],
    })),
    recordedBy: seed.recordedBy,
    recordedAt: `${seed.sessionDate}T17:40:00Z`,
  };
}

/** In-memory attendance table of the demo. Only the demo adapter injects it. */
@Injectable({ providedIn: 'root' })
export class AttendanceDemoStore {
  readonly sessions: AttendanceSession[] = SEEDS.map(toSession);

  nextId(): number {
    return this.sessions.reduce((max, session) => Math.max(max, session.id), 0) + 1;
  }
}
