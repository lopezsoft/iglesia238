import { Routes } from '@angular/router';
import { HttpOrganizationRepository } from './structure/data/http-organization.repository';
import { OrganizationRepository } from './structure/data/organization.repository';

export default [
  {
    path: '',
    providers: [
      { provide: OrganizationRepository, useClass: HttpOrganizationRepository },
    ],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./structure/organization.page').then((m) => m.OrganizationPage),
      },
    ],
  },
] satisfies Routes;
