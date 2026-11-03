import { Routes } from '@angular/router';
import { AccountingSetupRepository } from './setup/data/accounting-setup.repository';
import { HttpAccountingSetupRepository } from './setup/data/http-accounting-setup.repository';

export default [
  {
    path: '',
    providers: [{ provide: AccountingSetupRepository, useClass: HttpAccountingSetupRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./setup/accounting-setup.page').then((m) => m.AccountingSetupPage),
      },
    ],
  },
] satisfies Routes;
