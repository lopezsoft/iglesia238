import { Routes } from '@angular/router';

export default [
  {
    path: '',
    title: 'Mi perfil',
    loadComponent: () => import('./profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'change-password',
    title: 'Cambiar contraseña',
    loadComponent: () => import('./change-password.page').then((m) => m.ChangePasswordPage),
  },
  {
    path: '**',
    title: 'Página no encontrada',
    data: { embedded: true, homeLink: '/dashboard' },
    loadComponent: () => import('../errors/not-found.page'),
  },
] satisfies Routes;
