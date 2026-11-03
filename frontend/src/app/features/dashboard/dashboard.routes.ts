import { Routes } from '@angular/router';
import { DashboardRepository } from './data/dashboard.repository';
import { HttpDashboardRepository } from './data/http-dashboard.repository';

export default [
  {
    path: '',
    providers: [{ provide: DashboardRepository, useClass: HttpDashboardRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./dashboard.page').then((m) => m.DashboardPage),
      },
    ],
  },
] satisfies Routes;
