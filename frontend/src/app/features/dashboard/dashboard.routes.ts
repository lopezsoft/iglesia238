import { Routes } from '@angular/router';
import { DashboardRepository } from './data/dashboard.repository';
import { DemoDashboardRepository } from './data/demo-dashboard.repository';

export default [
  {
    path: '',
    providers: [{ provide: DashboardRepository, useClass: DemoDashboardRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./dashboard.page').then((m) => m.DashboardPage),
      },
    ],
  },
] satisfies Routes;
