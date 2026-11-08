import { Routes } from '@angular/router';
import { BrandingRepository } from './branding/data/branding.repository';
import { HttpBrandingRepository } from './branding/data/http-branding.repository';

export default [
  {
    path: '',
    providers: [{ provide: BrandingRepository, useClass: HttpBrandingRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./branding/branding.page').then((m) => m.BrandingPage),
      },
    ],
  },
] satisfies Routes;
