import { Routes } from '@angular/router';
import { HttpReportsRepository } from './data/http-reports.repository';
import { ReportsRepository } from './data/reports.repository';

export default [
  {
    path: '',
    providers: [{ provide: ReportsRepository, useClass: HttpReportsRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./reports.page').then((m) => m.ReportsPage),
      },
    ],
  },
] satisfies Routes;
