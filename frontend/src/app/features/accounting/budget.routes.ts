import { Routes } from '@angular/router';
import { BudgetRepository } from './budget/data/budget.repository';
import { DemoBudgetRepository } from './budget/data/demo-budget.repository';

export default [
  {
    path: '',
    providers: [{ provide: BudgetRepository, useClass: DemoBudgetRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./budget/budget.page').then((m) => m.BudgetPage),
      },
    ],
  },
] satisfies Routes;
