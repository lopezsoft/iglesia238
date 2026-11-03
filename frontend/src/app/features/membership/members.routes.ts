import { Routes } from '@angular/router';
import { HttpMembersRepository } from './members/data/http-members.repository';
import { MembersRepository } from './members/data/members.repository';

export default [
  {
    path: '',
    providers: [{ provide: MembersRepository, useClass: HttpMembersRepository }],
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
