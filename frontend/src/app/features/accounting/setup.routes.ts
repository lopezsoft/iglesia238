import { Routes } from '@angular/router';
import { AccountingSetupRepository } from './setup/data/accounting-setup.repository';
import { DemoAccountingSetupRepository } from './setup/data/demo-accounting-setup.repository';

export default [
  {
    path: '',
    providers: [{ provide: AccountingSetupRepository, useClass: DemoAccountingSetupRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./setup/accounting-setup.page').then((m) => m.AccountingSetupPage),
      },
    ],
  },
] satisfies Routes;
