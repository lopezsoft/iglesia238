import { Routes } from '@angular/router';
import { DemoDenominationsRepository } from './denominations/data/demo-denominations.repository';
import { DenominationsRepository } from './denominations/data/denominations.repository';

export default [
  {
    path: '',
    providers: [{ provide: DenominationsRepository, useClass: DemoDenominationsRepository }],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./denominations/denominations.page').then((m) => m.DenominationsPage),
      },
    ],
  },
] satisfies Routes;
