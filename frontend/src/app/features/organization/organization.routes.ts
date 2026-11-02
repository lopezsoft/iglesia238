import { Routes } from '@angular/router';
import { DemoOrganizationRepository } from './structure/data/demo-organization.repository';
import { OrganizationRepository } from './structure/data/organization.repository';

export default [
  {
    path: '',
    providers: [{ provide: OrganizationRepository, useClass: DemoOrganizationRepository }],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./structure/organization.page').then((m) => m.OrganizationPage),
      },
    ],
  },
] satisfies Routes;
