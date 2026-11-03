import { Routes } from '@angular/router';
import { HttpRecordsRepository } from './records/data/http-records.repository';
import { RecordsRepository } from './records/data/records.repository';

export default [
  {
    path: '',
    providers: [{ provide: RecordsRepository, useClass: HttpRecordsRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./records/records.page').then((m) => m.RecordsPage),
      },
    ],
  },
] satisfies Routes;
