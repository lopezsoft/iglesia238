import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

registerLocaleData(localeEsCo);

bootstrapApplication(App, appConfig).catch((error: unknown) => {
  // Bootstrap failed before DebugService exists: this is the only direct console use.
  console.error(error);
});
