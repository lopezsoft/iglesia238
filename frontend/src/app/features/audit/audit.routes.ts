import { Routes } from '@angular/router';
import { AuditLogRepository } from './audit-log/data/audit-log.repository';
import { HttpAuditLogRepository } from './audit-log/data/http-audit-log.repository';

export default [
  {
    path: '',
    providers: [{ provide: AuditLogRepository, useClass: HttpAuditLogRepository }],
    children: [
      {
        path: '',
        loadComponent: () => import('./audit-log/audit-log.page').then((m) => m.AuditLogPage),
      },
    ],
  },
] satisfies Routes;
