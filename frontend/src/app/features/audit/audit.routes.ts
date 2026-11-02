import { Routes } from '@angular/router';
import { AuditLogRepository } from './audit-log/data/audit-log.repository';
import { DemoAuditLogRepository } from './audit-log/data/demo-audit-log.repository';

export default [
  {
    path: '',
    providers: [{ provide: AuditLogRepository, useClass: DemoAuditLogRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./audit-log/audit-log.page').then((m) => m.AuditLogPage),
      },
    ],
  },
] satisfies Routes;
