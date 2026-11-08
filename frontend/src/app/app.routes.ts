import { Routes } from '@angular/router';
import { authGuard, emailPendingGuard, emailVerifiedGuard, guestGuard, permissionGuard } from './core/auth/auth.guards';
import { ACCESS } from './core/navigation/navigation';
import { PublicLayoutComponent } from './layout/public-layout.component';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  {
    // Links sent by email or copied by an administrator: they work with or without a session.
    path: 'login/reset-password',
    title: 'Nueva contraseña',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password.page').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'login/accept-invitation',
    title: 'Activar cuenta',
    loadComponent: () =>
      import('./features/auth/accept-invitation/accept-invitation.page').then((m) => m.AcceptInvitationPage),
  },
  {
    // Confirms the e-mail of a new account; works with or without a session.
    path: 'login/verify-email',
    title: 'Confirmar correo',
    loadComponent: () =>
      import('./features/auth/verify-email/verify-email.page').then((m) => m.VerifyEmailPage),
  },
  {
    path: 'login',
    canMatch: [guestGuard],
    loadChildren: () => import('./features/auth/auth.routes'),
  },
  {
    path: 'apply',
    component: PublicLayoutComponent,
    loadChildren: () => import('./features/public/public.routes'),
  },
  {
    // Opened by the QR code printed on a certificate: anyone can check a document, no account needed.
    path: 'verify-certificate',
    component: PublicLayoutComponent,
    loadChildren: () => import('./features/public/verify-certificate/verify-certificate.routes'),
  },
  {
    // Anyone can register a sede: no account and no prior link.
    path: 'register-congregation',
    component: PublicLayoutComponent,
    loadChildren: () => import('./features/public/congregation-registration/congregation-registration.routes'),
  },
  {
    // The only page of an account with an unconfirmed e-mail: the rest of the app is locked.
    path: 'confirm-email',
    component: ShellComponent,
    canMatch: [authGuard, emailPendingGuard],
    children: [
      {
        path: '',
        title: 'Confirma tu correo',
        loadComponent: () =>
          import('./features/auth/confirm-email/confirm-email.page').then((m) => m.ConfirmEmailPage),
      },
    ],
  },
  {
    path: '',
    component: ShellComponent,
    canMatch: [authGuard, emailVerifiedGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Inicio',
        loadChildren: () => import('./features/dashboard/dashboard.routes'),
      },
      {
        path: 'denominations',
        title: 'Denominaciones',
        canMatch: [permissionGuard(...ACCESS.denominations)],
        loadChildren: () => import('./features/platform/denominations.routes'),
      },
      {
        path: 'organization',
        title: 'Sedes y razones sociales',
        canMatch: [permissionGuard(...ACCESS.organization)],
        loadChildren: () => import('./features/organization/organization.routes'),
      },
      {
        path: 'privacy-policy',
        title: 'Política de datos',
        canMatch: [permissionGuard(...ACCESS.privacyPolicy)],
        loadChildren: () => import('./features/privacy-policy/privacy-policy.routes'),
      },
      {
        path: 'users',
        title: 'Usuarios y roles',
        canMatch: [permissionGuard(...ACCESS.users)],
        loadChildren: () => import('./features/users/users.routes'),
      },
      {
        path: 'applications',
        title: 'Solicitudes',
        canMatch: [permissionGuard(...ACCESS.applications)],
        loadChildren: () => import('./features/membership/applications.routes'),
      },
      {
        path: 'members',
        title: 'Miembros',
        canMatch: [permissionGuard(...ACCESS.members)],
        loadChildren: () => import('./features/membership/members.routes'),
      },
      {
        path: 'certificates',
        title: 'Certificados y carnés',
        canMatch: [permissionGuard(...ACCESS.certificates)],
        loadChildren: () => import('./features/secretariat/certificates.routes'),
      },
      {
        path: 'certificate-templates',
        title: 'Plantillas de certificados',
        canMatch: [permissionGuard(...ACCESS.certificateTemplates)],
        loadChildren: () => import('./features/secretariat/certificate-templates.routes'),
      },
      {
        path: 'attendance',
        title: 'Asistencia',
        canMatch: [permissionGuard(...ACCESS.attendance)],
        loadChildren: () => import('./features/secretariat/attendance.routes'),
      },
      {
        path: 'secretariat-records',
        title: 'Registros de secretaría',
        canMatch: [permissionGuard(...ACCESS.secretariatRecords)],
        loadChildren: () => import('./features/secretariat/records.routes'),
      },
      {
        path: 'accounting/contributions',
        title: 'Aportes',
        canMatch: [permissionGuard(...ACCESS.contributions)],
        loadChildren: () => import('./features/accounting/contributions.routes'),
      },
      {
        path: 'accounting/vows',
        title: 'Votos',
        canMatch: [permissionGuard(...ACCESS.vows)],
        loadChildren: () => import('./features/accounting/vows.routes'),
      },
      {
        path: 'accounting/cash-book',
        title: 'Libro de caja',
        canMatch: [permissionGuard(...ACCESS.cashBook)],
        loadChildren: () => import('./features/accounting/cash-book.routes'),
      },
      {
        path: 'accounting/tithe-settlements',
        title: 'Liquidación del diezmo',
        canMatch: [permissionGuard(...ACCESS.titheSettlements)],
        loadChildren: () => import('./features/accounting/tithe-settlements.routes'),
      },
      {
        path: 'accounting/budget',
        title: 'Presupuesto',
        canMatch: [permissionGuard(...ACCESS.budget)],
        loadChildren: () => import('./features/accounting/budget.routes'),
      },
      {
        path: 'accounting/setup',
        title: 'Configuración contable',
        canMatch: [permissionGuard(...ACCESS.accountingSetup)],
        loadChildren: () => import('./features/accounting/setup.routes'),
      },
      {
        path: 'reports',
        title: 'Reportes',
        canMatch: [permissionGuard(...ACCESS.reports)],
        loadChildren: () => import('./features/reports/reports.routes'),
      },
      {
        path: 'audit',
        title: 'Auditoría',
        canMatch: [permissionGuard(...ACCESS.audit)],
        loadChildren: () => import('./features/audit/audit.routes'),
      },
      {
        path: 'profile',
        title: 'Mi perfil',
        loadChildren: () => import('./features/profile/profile.routes'),
      },
      {
        path: 'forbidden',
        title: 'Sin acceso',
        loadComponent: () => import('./features/errors/forbidden.page'),
      },
    ],
  },
  {
    path: '**',
    title: 'Página no encontrada',
    loadComponent: () => import('./features/errors/not-found.page'),
  },
];
