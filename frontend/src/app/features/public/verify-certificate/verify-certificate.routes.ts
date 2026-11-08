import { Routes } from '@angular/router';
import { CertificateVerificationRepository } from './data/certificate-verification.repository';
import { HttpCertificateVerificationRepository } from './data/http-certificate-verification.repository';

export default [
  {
    path: '',
    title: 'Verificar documento',
    providers: [
      {
        provide: CertificateVerificationRepository,
        useClass: HttpCertificateVerificationRepository,
      },
    ],
    loadComponent: () => import('./verify-certificate.page').then((m) => m.VerifyCertificatePage),
  },
] satisfies Routes;
