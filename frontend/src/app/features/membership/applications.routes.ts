import { Routes } from '@angular/router';
import { ApplicationsRepository } from './applications/data/applications.repository';
import { HttpApplicationsRepository } from './applications/data/http-applications.repository';

export default [
  {
    path: '',
    providers: [{ provide: ApplicationsRepository, useClass: HttpApplicationsRepository }],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./applications/applications.page').then((m) => m.ApplicationsPage),
      },
    ],
  },
] satisfies Routes;
