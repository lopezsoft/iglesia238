import { Routes } from '@angular/router';
import { DemoTitheSettlementsRepository } from './tithe-settlements/data/demo-tithe-settlements.repository';
import { TitheSettlementsRepository } from './tithe-settlements/data/tithe-settlements.repository';

export default [
  {
    path: '',
    providers: [{ provide: TitheSettlementsRepository, useClass: DemoTitheSettlementsRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./tithe-settlements/tithe-settlements.page').then((m) => m.TitheSettlementsPage),
      },
    ],
  },
] satisfies Routes;
