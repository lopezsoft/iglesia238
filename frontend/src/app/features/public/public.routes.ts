import { Routes } from '@angular/router';
import { HttpPublicApplicationRepository } from './application/data/http-public-application.repository';
import { PublicApplicationRepository } from './application/data/public-application.repository';

export default [
  {
    path: '',
    providers: [{ provide: PublicApplicationRepository, useClass: HttpPublicApplicationRepository }],
    children: [
      {
        path: '',
        title: 'Solicitud de membresía',
        loadComponent: () => import('./application/application.page').then((m) => m.ApplicationPage),
      },
      {
        path: 'status',
        title: 'Consultar mi solicitud',
        loadComponent: () => import('./status/application-status.page').then((m) => m.ApplicationStatusPage),
      },
      {
        // A mistyped public link must not fall through to the staff shell (and its login).
        path: '**',
        title: 'Página no encontrada',
        data: { embedded: true, homeLink: '/apply' },
        loadComponent: () => import('../errors/not-found.page'),
      },
    ],
  },
] satisfies Routes;
