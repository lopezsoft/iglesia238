import { Routes } from '@angular/router';
import { AttendanceRepository } from './attendance/data/attendance.repository';
import { HttpAttendanceRepository } from './attendance/data/http-attendance.repository';

export default [
  {
    path: '',
    providers: [{ provide: AttendanceRepository, useClass: HttpAttendanceRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./attendance/attendance.page').then((m) => m.AttendancePage),
      },
    ],
  },
] satisfies Routes;
