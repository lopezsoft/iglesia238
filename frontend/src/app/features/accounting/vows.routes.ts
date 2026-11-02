import { Routes } from '@angular/router';
import { DemoVowsRepository } from './vows/data/demo-vows.repository';
import { VowsRepository } from './vows/data/vows.repository';

export default [
  {
    path: '',
    providers: [{ provide: VowsRepository, useClass: DemoVowsRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./vows/vows.page').then((m) => m.VowsPage),
      },
    ],
  },
] satisfies Routes;
