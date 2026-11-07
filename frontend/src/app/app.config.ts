import {
  ApplicationConfig,
  ErrorHandler,
  LOCALE_ID,
  inject,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withNavigationErrorHandler,
} from '@angular/router';
import { routes } from './app.routes';
import { AuthGateway } from './core/auth/auth.gateway';
import { HttpAuthGateway } from './core/auth/http-auth.gateway';
import { CatalogsRepository } from './core/catalogs/catalogs.repository';
import { HttpCatalogsRepository } from './core/catalogs/http-catalogs.repository';
import { GlobalErrorHandler } from './core/errors/global-error-handler';
import { provideApiHttp } from './core/http/http.providers';
import { VersionUpdateService } from './core/version/version-update.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      withNavigationErrorHandler((navigationError) => {
        inject(VersionUpdateService).handlePotentialChunkError(navigationError.error);
      }),
    ),
    provideApiHttp(),
    { provide: LOCALE_ID, useValue: 'es-CO' },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    { provide: AuthGateway, useClass: HttpAuthGateway },
    { provide: CatalogsRepository, useClass: HttpCatalogsRepository },
  ],
};
