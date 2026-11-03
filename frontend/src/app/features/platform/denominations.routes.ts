import { Routes } from '@angular/router';
import { DenominationsRepository } from './denominations/data/denominations.repository';
import { HttpDenominationsRepository } from './denominations/data/http-denominations.repository';

export default [
  {
    path: '',
    providers: [{ provide: DenominationsRepository, useClass: HttpDenominationsRepository }],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./denominations/denominations.page').then((m) => m.DenominationsPage),
      },
    ],
  },
] satisfies Routes;
