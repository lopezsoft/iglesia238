import { Routes } from '@angular/router';
import { CashBookRepository } from './cash-book/data/cash-book.repository';
import { HttpCashBookRepository } from './cash-book/data/http-cash-book.repository';

export default [
  {
    path: '',
    providers: [{ provide: CashBookRepository, useClass: HttpCashBookRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./cash-book/cash-book.page').then((m) => m.CashBookPage),
      },
    ],
  },
] satisfies Routes;
