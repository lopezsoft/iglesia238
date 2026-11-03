import { Routes } from '@angular/router';

/** Sign-in and password recovery (guests only). Reset and invitation links live in app.routes.ts. */
export default [
  {
    path: '',
    title: 'Iniciar sesión',
    loadComponent: () => import('./login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'recover-password',
    title: 'Recuperar contraseña',
    loadComponent: () => import('./recover-password/recover-password.page').then((m) => m.RecoverPasswordPage),
  },
  {
    // An unknown /login/... URL shows the 404 instead of falling through to the shell guard.
    path: '**',
    title: 'Página no encontrada',
    loadComponent: () => import('../errors/not-found.page'),
  },
] satisfies Routes;
