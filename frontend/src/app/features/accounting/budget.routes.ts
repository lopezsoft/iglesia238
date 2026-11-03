import { Routes } from '@angular/router';
import { BudgetRepository } from './budget/data/budget.repository';
import { HttpBudgetRepository } from './budget/data/http-budget.repository';

export default [
  {
    path: '',
    providers: [{ provide: BudgetRepository, useClass: HttpBudgetRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./budget/budget.page').then((m) => m.BudgetPage),
      },
    ],
  },
] satisfies Routes;
