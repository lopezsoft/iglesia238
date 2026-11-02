import { Routes } from '@angular/router';
import { DemoRecordsRepository } from './records/data/demo-records.repository';
import { RecordsRepository } from './records/data/records.repository';

export default [
  {
    path: '',
    providers: [{ provide: RecordsRepository, useClass: DemoRecordsRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./records/records.page').then((m) => m.RecordsPage),
      },
    ],
  },
] satisfies Routes;
