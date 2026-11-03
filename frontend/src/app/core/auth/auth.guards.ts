import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService, CONFIRM_EMAIL_PATH } from './auth.service';
import { Permission } from './permission';

/** Lets only signed-in users load the app shell; others go to the login with a return URL. */
export const authGuard: CanMatchFn = async (_route, segments) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureRestored();
  if (auth.isAuthenticated()) {
    return true;
  }
  const returnUrl = '/' + segments.map((segment) => segment.path).join('/');
  return router.createUrlTree(['/login'], {
    queryParams: returnUrl === '/' ? {} : { returnUrl },
  });
};

/**
 * Locks the app for an account whose e-mail is not confirmed: every authenticated route (and its lazy chunk)
 * is skipped and the person lands on the "Confirma tu correo" page. Runs after `authGuard`.
 */
export const emailVerifiedGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureRestored();
  return auth.emailVerified() ? true : router.createUrlTree([CONFIRM_EMAIL_PATH]);
};

/** The "Confirma tu correo" page only exists for unconfirmed accounts; confirmed ones go to the app. */
export const emailPendingGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureRestored();
  return auth.emailVerified() ? router.createUrlTree(['/dashboard']) : true;
};

/** Keeps signed-in users away from the login screen. */
export const guestGuard: CanMatchFn = async () => {
  // inject() only works before the first await.
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureRestored();
  return auth.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true;
};

/**
 * Loads a lazy route only when the active scope grants any of `permissions`; otherwise it
 * shows the forbidden page. The chunk of a forbidden module is never downloaded.
 */
export function permissionGuard(...permissions: Permission[]): CanMatchFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.ensureRestored();
    return auth.canAny(permissions) ? true : router.createUrlTree(['/forbidden']);
  };
}
