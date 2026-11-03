import { Routes } from '@angular/router';
import { HttpUserRolesRepository } from './user-roles/data/http-user-roles.repository';
import { UserRolesRepository } from './user-roles/data/user-roles.repository';

export default [
  {
    path: '',
    providers: [{ provide: UserRolesRepository, useClass: HttpUserRolesRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./user-roles/user-roles.page').then((m) => m.UserRolesPage),
      },
    ],
  },
] satisfies Routes;
