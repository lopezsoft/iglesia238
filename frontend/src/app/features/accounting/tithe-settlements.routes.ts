import { Routes } from '@angular/router';
import { HttpTitheSettlementsRepository } from './tithe-settlements/data/http-tithe-settlements.repository';
import { TitheSettlementsRepository } from './tithe-settlements/data/tithe-settlements.repository';

export default [
  {
    path: '',
    providers: [{ provide: TitheSettlementsRepository, useClass: HttpTitheSettlementsRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./tithe-settlements/tithe-settlements.page').then((m) => m.TitheSettlementsPage),
      },
    ],
  },
] satisfies Routes;
