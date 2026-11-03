import { Routes } from '@angular/router';
import { HttpPrivacyPolicyRepository } from './data/http-privacy-policy.repository';
import { PrivacyPolicyRepository } from './data/privacy-policy.repository';

export default [
  {
    path: '',
    providers: [{ provide: PrivacyPolicyRepository, useClass: HttpPrivacyPolicyRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./privacy-policy.page').then((m) => m.PrivacyPolicyPage),
      },
    ],
  },
] satisfies Routes;
