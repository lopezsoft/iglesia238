import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { ATTENDANCE_REPOSITORY } from './application/attendance.repository.js';
import { CorrectAttendanceSession } from './application/correct-attendance-session.use-case.js';
import { DeleteAttendanceSession } from './application/delete-attendance-session.use-case.js';
import { ExportAttendanceSessions } from './application/export-attendance-sessions.use-case.js';
import { GetAttendanceOptions } from './application/get-attendance-options.use-case.js';
import {
  FindAttendanceSessionByKey,
  GetAttendanceSession,
} from './application/get-attendance-session.use-case.js';
import { GetAttendanceStats } from './application/get-attendance-stats.use-case.js';
import { ListAttendanceSessions } from './application/list-attendance-sessions.use-case.js';
import { RecordAttendanceSession } from './application/record-attendance-session.use-case.js';
import { PrismaAttendanceRepository } from './infrastructure/prisma-attendance.repository.js';
import { AttendanceSessionsController } from './presentation/attendance-sessions.controller.js';

/**
 * Attendance (D-03). Transactions, audit and the clock come from the global FoundationModule.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AttendanceSessionsController],
  providers: [
    { provide: ATTENDANCE_REPOSITORY, useClass: PrismaAttendanceRepository },
    GetAttendanceOptions,
    ListAttendanceSessions,
    GetAttendanceSession,
    FindAttendanceSessionByKey,
    RecordAttendanceSession,
    CorrectAttendanceSession,
    DeleteAttendanceSession,
    GetAttendanceStats,
    ExportAttendanceSessions,
  ],
})
export class AttendanceModule {}
