import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
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
