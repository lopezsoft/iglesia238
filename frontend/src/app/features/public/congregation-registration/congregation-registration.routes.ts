import { Routes } from '@angular/router';
import { HttpPublicApplicationRepository } from '../application/data/http-public-application.repository';
import { PublicApplicationRepository } from '../application/data/public-application.repository';
import { CongregationRegistrationRepository } from './data/congregation-registration.repository';
import { HttpCongregationRegistrationRepository } from './data/http-congregation-registration.repository';

export default [
  {
    path: '',
    providers: [
      { provide: CongregationRegistrationRepository, useClass: HttpCongregationRegistrationRepository },
      // The municipality picker of the membership form searches the DIVIPOLA catalog through this port.
      { provide: PublicApplicationRepository, useClass: HttpPublicApplicationRepository },
    ],
    children: [
      {
        path: '',
        title: 'Registrar mi sede',
        loadComponent: () =>
          import('./congregation-registration.page').then((m) => m.CongregationRegistrationPage),
      },
      {
        // A mistyped public link must not fall through to the staff shell (and its login).
        path: '**',
        title: 'Página no encontrada',
        data: { embedded: true, homeLink: '/register-congregation' },
        loadComponent: () => import('../../errors/not-found.page'),
      },
    ],
  },
] satisfies Routes;
