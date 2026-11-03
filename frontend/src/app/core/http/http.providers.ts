import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders } from '@angular/core';
import { authInterceptor } from './auth.interceptor';
import { errorInterceptor } from './error.interceptor';
import { scopeInterceptor } from './scope.interceptor';

/**
 * HttpClient with the API interceptors. Order matters: the first one is the outermost, so the
 * error mapper sees the failure AFTER the auth interceptor had its chance to renew the token.
 */
export function provideApiHttp(): EnvironmentProviders {
  return provideHttpClient(withFetch(), withInterceptors([errorInterceptor, authInterceptor, scopeInterceptor]));
}
