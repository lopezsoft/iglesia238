import { Routes } from '@angular/router';
import { CashBookRepository } from './cash-book/data/cash-book.repository';
import { DemoCashBookRepository } from './cash-book/data/demo-cash-book.repository';

export default [
  {
    path: '',
    providers: [{ provide: CashBookRepository, useClass: DemoCashBookRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./cash-book/cash-book.page').then((m) => m.CashBookPage),
      },
    ],
  },
] satisfies Routes;
