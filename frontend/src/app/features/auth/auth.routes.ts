import { Routes } from '@angular/router';
import { DemoAccountsRepository } from './login/data/demo-accounts.repository';
import { InMemoryDemoAccountsRepository } from './login/data/in-memory-demo-accounts.repository';

export default [
  {
    path: '',
    providers: [{ provide: DemoAccountsRepository, useClass: InMemoryDemoAccountsRepository }],
    children: [
      {
        path: '',
        title: 'Iniciar sesión',
        loadComponent: () => import('./login/login.page').then((m) => m.LoginPage),
      },
      {
        path: 'recover-password',
        title: 'Recuperar contraseña',
        loadComponent: () =>
          import('./recover-password/recover-password.page').then((m) => m.RecoverPasswordPage),
      },
      {
        // An unknown /login/... URL shows the 404 instead of falling through to the shell guard.
        path: '**',
        title: 'Página no encontrada',
        loadComponent: () => import('../errors/not-found.page'),
      },
    ],
  },
] satisfies Routes;
