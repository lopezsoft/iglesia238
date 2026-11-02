import { Routes } from '@angular/router';
import { DemoMembersRepository } from './members/data/demo-members.repository';
import { MembersRepository } from './members/data/members.repository';

// The demo adapter answers until the members endpoints exist in the API; then an HTTP adapter
// replaces it here and nothing else changes.
export default [
  {
    path: '',
    providers: [{ provide: MembersRepository, useClass: DemoMembersRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./members/members.page').then((m) => m.MembersPage),
      },
      {
        path: ':id',
        title: 'Ficha del miembro',
        loadComponent: () => import('./members/member-detail.page').then((m) => m.MemberDetailPage),
      },
    ],
  },
] satisfies Routes;
