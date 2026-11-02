import { Routes } from '@angular/router';
import { AttendanceRepository } from './attendance/data/attendance.repository';
import { DemoAttendanceRepository } from './attendance/data/demo-attendance.repository';

export default [
  {
    path: '',
    providers: [{ provide: AttendanceRepository, useClass: DemoAttendanceRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./attendance/attendance.page').then((m) => m.AttendancePage),
      },
    ],
  },
] satisfies Routes;
