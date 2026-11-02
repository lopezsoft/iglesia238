import { Routes } from '@angular/router';
import { ContributionsRepository } from './contributions/data/contributions.repository';
import { DemoContributionsRepository } from './contributions/data/demo-contributions.repository';

export default [
  {
    path: '',
    providers: [{ provide: ContributionsRepository, useClass: DemoContributionsRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./contributions/contributions.page').then((m) => m.ContributionsPage),
      },
    ],
  },
] satisfies Routes;
