import { Routes } from '@angular/router';
import { ContributionsRepository } from './contributions/data/contributions.repository';
import { HttpContributionsRepository } from './contributions/data/http-contributions.repository';

export default [
  {
    path: '',
    providers: [{ provide: ContributionsRepository, useClass: HttpContributionsRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./contributions/contributions.page').then((m) => m.ContributionsPage),
      },
    ],
  },
] satisfies Routes;
