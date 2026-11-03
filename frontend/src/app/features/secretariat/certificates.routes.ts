import { Routes } from '@angular/router';
import { CertificatesRepository } from './certificates/data/certificates.repository';
import { HttpCertificatesRepository } from './certificates/data/http-certificates.repository';

export default [
  {
    path: '',
    providers: [{ provide: CertificatesRepository, useClass: HttpCertificatesRepository }],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./certificates/certificates.page').then((m) => m.CertificatesPage),
      },
    ],
  },
] satisfies Routes;
