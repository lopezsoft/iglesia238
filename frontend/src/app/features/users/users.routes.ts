import { Routes } from '@angular/router';
import { DemoUserRolesRepository } from './user-roles/data/demo-user-roles.repository';
import { UserRolesRepository } from './user-roles/data/user-roles.repository';

export default [
  {
    path: '',
    providers: [{ provide: UserRolesRepository, useClass: DemoUserRolesRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./user-roles/user-roles.page').then((m) => m.UserRolesPage),
      },
    ],
  },
] satisfies Routes;
