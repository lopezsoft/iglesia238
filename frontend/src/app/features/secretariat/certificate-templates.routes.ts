import { Routes } from '@angular/router';
import { CertificateTemplatesRepository } from './certificate-templates/data/certificate-templates.repository';
import { HttpCertificateTemplatesRepository } from './certificate-templates/data/http-certificate-templates.repository';

export default [
  {
    path: '',
    providers: [
      { provide: CertificateTemplatesRepository, useClass: HttpCertificateTemplatesRepository },
    ],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./certificate-templates/certificate-templates.page').then(
            (m) => m.CertificateTemplatesPage,
          ),
      },
    ],
  },
] satisfies Routes;
