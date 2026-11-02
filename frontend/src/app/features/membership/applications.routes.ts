import { Routes } from '@angular/router';
import { ApplicationsRepository } from './applications/data/applications.repository';
import { DemoApplicationsRepository } from './applications/data/demo-applications.repository';

export default [
  {
    path: '',
    providers: [{ provide: ApplicationsRepository, useClass: DemoApplicationsRepository }],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./applications/applications.page').then((m) => m.ApplicationsPage),
      },
    ],
  },
] satisfies Routes;
