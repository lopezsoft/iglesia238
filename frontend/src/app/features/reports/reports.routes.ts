import { Routes } from '@angular/router';
import { DemoReportsRepository } from './data/demo-reports.repository';
import { ReportsRepository } from './data/reports.repository';

export default [
  {
    path: '',
    providers: [{ provide: ReportsRepository, useClass: DemoReportsRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./reports.page').then((m) => m.ReportsPage),
      },
    ],
  },
] satisfies Routes;
