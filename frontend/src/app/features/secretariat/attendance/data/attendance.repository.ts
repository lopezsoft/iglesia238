import { Observable } from 'rxjs';
import {
  AttendanceCongregation,
  AttendanceCount,
  AttendanceHistory,
  AttendanceHistoryQuery,
  AttendanceSession,
  AttendanceSessionInput,
  AttendanceSessionKey,
} from './attendance.models';

/**
 * Port of the attendance module (D-03). One session per sede, meeting type and date: creating
 * a second one fails with DomainError('DUPLICATE_SESSION') and the existing one is corrected
 * with `update`.
 */
export abstract class AttendanceRepository {
  /** Sedes of the active scope: one for a sede role, every active sede for a denomination role. */
  abstract congregations(): Observable<AttendanceCongregation[]>;

  abstract history(query: AttendanceHistoryQuery): Observable<AttendanceHistory>;

  /** The session recorded for the key, or null. */
  abstract find(key: AttendanceSessionKey): Observable<AttendanceSession | null>;

  abstract create(input: AttendanceSessionInput): Observable<AttendanceSession>;

  abstract update(id: number, counts: readonly AttendanceCount[]): Observable<AttendanceSession>;
}
