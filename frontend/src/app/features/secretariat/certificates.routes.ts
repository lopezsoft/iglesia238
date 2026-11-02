import { Routes } from '@angular/router';
import { CertificatesRepository } from './certificates/data/certificates.repository';
import { DemoCertificatesRepository } from './certificates/data/demo-certificates.repository';

export default [
  {
    path: '',
    providers: [{ provide: CertificatesRepository, useClass: DemoCertificatesRepository }],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./certificates/certificates.page').then((m) => m.CertificatesPage),
      },
    ],
  },
] satisfies Routes;
