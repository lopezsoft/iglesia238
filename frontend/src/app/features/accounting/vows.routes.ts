import { Routes } from '@angular/router';
import { HttpVowsRepository } from './vows/data/http-vows.repository';
import { VowsRepository } from './vows/data/vows.repository';

export default [
  {
    path: '',
    providers: [{ provide: VowsRepository, useClass: HttpVowsRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./vows/vows.page').then((m) => m.VowsPage),
      },
    ],
  },
] satisfies Routes;
